
const { z } = require("zod");
const pool = require("../config/db");

const {
  recordAuditLog,
  getRequestAuditMetadata,
} = require("../services/audit.service");

const directoryQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["lawyer", "investigator"]).optional(),
});

const assignmentResponseSchema = z.object({
  action: z.enum(["accept", "reject"]),
}).strict();

const listPublicProfessionals = async (req, res) => {
  try {
    const validation = directoryQuerySchema.safeParse(req.query);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid search or role parameter",
        errors: validation.error.flatten(),
      });
    }

    const { search, role } = validation.data;

    const conditions = ["role IN ('lawyer', 'investigator')"];
    const values = [];

    if (role) {
      values.push(role);
      conditions.push(`role = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`full_name ILIKE $${values.length}`);
    }

    const result = await pool.query(
      `SELECT id, full_name, role, created_at
       FROM users
       WHERE ${conditions.join(" AND ")}
       ORDER BY full_name ASC
       LIMIT 50`,
      values
    );

    return res.status(200).json({
      success: true,
      total: result.rows.length,
      professionals: result.rows,
    });
  } catch (error) {
    console.error("List professionals error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve professionals",
    });
  }
};


// GET /api/professionals/assignments
const getMyAssignments = async (req, res) => {
  try {
    const professionalId = req.user.id;
    const professionalRole = req.user.role;

    if (!["lawyer", "investigator"].includes(professionalRole)) {
      return res.status(403).json({
        success: false,
        message: "Only lawyers and investigators can view assignments",
      });
    }

    const result = await pool.query(
      `SELECT
          id,
          case_id,
          professional_id,
          assigned_by,
          role,
          status,
          assigned_at,
          responded_at,
          updated_at
       FROM case_assignments
       WHERE professional_id = $1
         AND role = $2
       ORDER BY assigned_at DESC
       LIMIT 100`,
      [professionalId, professionalRole]
    );

    return res.status(200).json({
      success: true,
      total: result.rows.length,
      assignments: result.rows,
    });
  } catch (error) {
    console.error("Get professional assignments error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve assignments",
    });
  }
};

// PATCH /api/professionals/assignments/:id/respond
const respondToAssignment = async (req, res) => {
  const idValidation = z.string().uuid().safeParse(req.params.id);

  if (!idValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid assignment ID",
    });
  }

  const bodyValidation = assignmentResponseSchema.safeParse(req.body);

  if (!bodyValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Action must be accept or reject",
      errors: bodyValidation.error.issues,
    });
  }

  const professionalId = req.user.id;
  const professionalRole = req.user.role;

  if (!["lawyer", "investigator"].includes(professionalRole)) {
    return res.status(403).json({
      success: false,
      message: "Only lawyers and investigators can respond to assignments",
    });
  }

  const assignmentId = req.params.id;
  const { action } = bodyValidation.data;

const newStatus =
  action === "accept" ? "accepted" : "declined";

  const db = await pool.connect();
  let transactionStarted = false;

  try {
    await db.query("BEGIN");
    transactionStarted = true;

    // Lock only an assignment belonging to the logged-in professional.
    const assignmentResult = await db.query(
      `SELECT id, case_id, professional_id, role, status
       FROM case_assignments
       WHERE id = $1
         AND professional_id = $2
         AND role = $3
       FOR UPDATE`,
      [assignmentId, professionalId, professionalRole]
    );

    if (assignmentResult.rowCount === 0) {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    const assignment = assignmentResult.rows[0];

    if (assignment.status !== "pending_acceptance") {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "This assignment has already been responded to",
        current_status: assignment.status,
      });
    }

    const updateResult = await db.query(
      `UPDATE case_assignments
       SET status = $1,
           responded_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [newStatus, assignmentId]
    );

    const updatedAssignment = updateResult.rows[0];

    await recordAuditLog(
      {
        actorId: professionalId,
        action:
          action === "accept"
            ? "CASE_ASSIGNMENT_ACCEPTED"
            : "CASE_ASSIGNMENT_REJECTED",
        entityType: "case_assignment",
        entityId: assignmentId,
        details: {
          caseId: assignment.case_id,
          professionalRole,
          previousStatus: "pending_acceptance",
          newStatus,
        },
        ...getRequestAuditMetadata(req),
      },
      { client: db }
    );

    await db.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: `Assignment ${newStatus} successfully`,
      assignment: updatedAssignment,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Assignment rollback failed");
      }
    }

    console.error("Respond to assignment error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process assignment response",
    });
  } finally {
    db.release();
  }
};

module.exports = {
  listPublicProfessionals,
  getMyAssignments,
  respondToAssignment,
};