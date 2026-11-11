const { z } = require("zod");
const pool = require("../config/db");

const caseIdSchema = z.string().uuid();

const updateCaseSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().min(10).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined || data.description !== undefined,
    {
      message: "Provide at least one field to update",
    }
  );

// Check whether the current professional created the case
// and has an accepted assignment.
const verifyProfessionalAccess = async (
  client,
  caseId,
  user
) => {
  const result = await client.query(
    `SELECT
       c.id,
       c.title,
       c.description,
       c.status,
       c.created_by
     FROM cases c
     INNER JOIN case_assignments ca
       ON ca.case_id = c.id
     WHERE c.id = $1
       AND c.created_by = $2
       AND ca.professional_id = $2
       AND ca.role = $3
       AND ca.status = 'accepted'
     FOR UPDATE OF c`,
    [caseId, user.id, user.role]
  );

  return result.rows[0] || null;
};

// GET /api/cases
const getCases = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const result = await pool.query(
      `SELECT DISTINCT
         c.id,
         c.case_number,
         c.title,
         c.description,
         c.status,
         c.created_by,
         c.created_at,
         c.updated_at
       FROM cases c
       WHERE
         $1 = 'admin'
         OR (
           $1 = 'client'
           AND EXISTS (
             SELECT 1
             FROM case_clients cc
             WHERE cc.case_id = c.id
               AND cc.client_id = $2
               AND cc.status = 'active'
           )
         )
         OR (
           $1 IN ('lawyer', 'investigator')
           AND EXISTS (
             SELECT 1
             FROM case_assignments ca
             WHERE ca.case_id = c.id
               AND ca.professional_id = $2
               AND ca.role = $1
               AND ca.status = 'accepted'
           )
         )
       ORDER BY c.created_at DESC
       LIMIT 100`,
      [role, userId]
    );

    return res.status(200).json({
      success: true,
      total: result.rows.length,
      cases: result.rows,
    });
  } catch (error) {
    console.error("Get cases error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve cases",
    });
  }
};

// GET /api/cases/:id
const getCaseById = async (req, res) => {
  const idValidation = caseIdSchema.safeParse(req.params.id);

  if (!idValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid case ID",
    });
  }

  try {
    const userId = req.user.id;
    const role = req.user.role;
    const caseId = req.params.id;

    const result = await pool.query(
      `SELECT
         c.id,
         c.case_number,
         c.title,
         c.description,
         c.status,
         c.created_by,
         c.created_at,
         c.updated_at
       FROM cases c
       WHERE c.id = $3
         AND (
           $1 = 'admin'
           OR (
             $1 = 'client'
             AND EXISTS (
               SELECT 1
               FROM case_clients cc
               WHERE cc.case_id = c.id
                 AND cc.client_id = $2
                 AND cc.status = 'active'
             )
           )
           OR (
             $1 IN ('lawyer', 'investigator')
             AND EXISTS (
               SELECT 1
               FROM case_assignments ca
               WHERE ca.case_id = c.id
                 AND ca.professional_id = $2
                 AND ca.role = $1
                 AND ca.status = 'accepted'
             )
           )
         )`,
      [role, userId, caseId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Case not found",
      });
    }

    const caseData = result.rows[0];

    let approval = null;

    // Return the latest Admin review to the assigned professional
    // when the case requires corrections.
    if (
      ["lawyer", "investigator"].includes(role) &&
      caseData.created_by === userId &&
      caseData.status === "changes_requested"
    ) {
      const approvalResult = await pool.query(
        `SELECT
           id,
           status,
           comments,
           admin_id,
           reviewed_at,
           updated_at
         FROM case_approvals
         WHERE case_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [caseId]
      );

      approval = approvalResult.rows[0] || null;
    }

    return res.status(200).json({
      success: true,
      case: caseData,
      approval,
    });
  } catch (error) {
    console.error("Get case details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve case details",
    });
  }
};

// PATCH /api/cases/:id
const updateCase = async (req, res) => {
  const idValidation = caseIdSchema.safeParse(req.params.id);

  if (!idValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid case ID",
    });
  }

  const bodyValidation = updateCaseSchema.safeParse(req.body);

  if (!bodyValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid update data",
      errors: bodyValidation.error.flatten(),
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const caseData = await verifyProfessionalAccess(
      client,
      req.params.id,
      req.user
    );

    if (!caseData) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Case not found or you do not have access",
      });
    }

    if (caseData.status !== "changes_requested") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Only cases requiring changes can be updated",
      });
    }

    const { title, description } = bodyValidation.data;

    const updatedResult = await client.query(
      `UPDATE cases
       SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING
         id,
         case_number,
         title,
         description,
         status,
         updated_at`,
      [
        title ?? null,
        description ?? null,
        req.params.id,
      ]
    );

    const updatedCase = updatedResult.rows[0];

    await client.query(
      `INSERT INTO audit_logs (
         actor_id,
         action,
         entity_type,
         entity_id,
         details,
         ip_address,
         user_agent
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        req.user.id,
        "CASE_UPDATED",
        "case",
        req.params.id,
        JSON.stringify({
          previousTitle: caseData.title,
          newTitle: updatedCase.title,
          previousDescription: caseData.description,
          newDescription: updatedCase.description,
          status: updatedCase.status,
        }),
        req.ip,
        req.get("user-agent") || null,
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Case details updated successfully",
      case: updatedCase,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Update case error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update case details",
    });
  } finally {
    client.release();
  }
};

// POST /api/cases/:id/resubmit
const resubmitCase = async (req, res) => {
  const idValidation = caseIdSchema.safeParse(req.params.id);

  if (!idValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid case ID",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const caseData = await verifyProfessionalAccess(
      client,
      req.params.id,
      req.user
    );

    if (!caseData) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Case not found or you do not have access",
      });
    }

    if (caseData.status !== "changes_requested") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Only cases requiring changes can be resubmitted",
      });
    }

    const approvalResult = await client.query(
      `SELECT
         id,
         status,
         comments,
         admin_id
       FROM case_approvals
       WHERE case_id = $1
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [req.params.id]
    );

    if (
      approvalResult.rowCount === 0 ||
      approvalResult.rows[0].status !== "changes_requested"
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "No pending Admin change request was found",
      });
    }

    const previousApproval = approvalResult.rows[0];

    // Reset the approval record to pending.
    // This also satisfies the database constraint that pending
    // approvals must have null admin_id and reviewed_at.
    await client.query(
      `UPDATE case_approvals
       SET
         status = 'pending',
         admin_id = NULL,
         comments = NULL,
         reviewed_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [previousApproval.id]
    );

    const updatedCaseResult = await client.query(
      `UPDATE cases
       SET
         status = 'pending_approval',
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING
         id,
         case_number,
         title,
         description,
         status,
         updated_at`,
      [req.params.id]
    );

    const updatedCase = updatedCaseResult.rows[0];

    // Preserve the previous Admin feedback in the audit history.
    await client.query(
      `INSERT INTO audit_logs (
         actor_id,
         action,
         entity_type,
         entity_id,
         details,
         ip_address,
         user_agent
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        req.user.id,
        "CASE_RESUBMITTED",
        "case",
        req.params.id,
        JSON.stringify({
          previousCaseStatus: caseData.status,
          newCaseStatus: updatedCase.status,
          approvalId: previousApproval.id,
          previousApprovalStatus: previousApproval.status,
          previousAdminId: previousApproval.admin_id,
          previousAdminFeedback: previousApproval.comments,
          newApprovalStatus: "pending",
        }),
        req.ip,
        req.get("user-agent") || null,
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Case resubmitted successfully for Admin review",
      case: updatedCase,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Resubmit case error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to resubmit case",
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getCases,
  getCaseById,
  updateCase,
  resubmitCase,
};