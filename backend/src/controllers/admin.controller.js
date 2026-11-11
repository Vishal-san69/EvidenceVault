
const bcrypt = require("bcrypt");
const { z } = require("zod");
const pool = require("../config/db");

const {
  recordAuditLog,
  getRequestAuditMetadata,
} = require("../services/audit.service");

const createProfessionalSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(72),
  role: z.enum(["lawyer", "investigator"]),
}).strict();

const assignProfessionalSchema = z.object({
  professional_id: z.string().uuid(),
}).strict();

// POST /api/admin/professionals
const createProfessional = async (req, res) => {
  const client = await pool.connect();

  try {
    const validation = createProfessionalSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid professional account details",
        errors: validation.error.issues,
      });
    }

    const { full_name, password, role } = validation.data;
    const email = validation.data.email.toLowerCase();

    const passwordHash = await bcrypt.hash(password, 12);

    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO users (
        full_name,
        email,
        password_hash,
        role
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id, full_name, email, role, created_at`,
      [full_name, email, passwordHash, role]
    );

    const professional = result.rows[0];

    await recordAuditLog(
      {
        actorId: req.user.id,
        action: "PROFESSIONAL_CREATED",
        entityType: "user",
        entityId: professional.id,
        details: {
          professionalRole: professional.role,
          professionalEmail: professional.email,
        },
        ...getRequestAuditMetadata(req),
      },
      { client }
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Professional account created successfully",
      user: professional,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    console.error("Create professional error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create professional account",
    });
  } finally {
    client.release();
  }
};

// GET /api/admin/professionals
const listProfessionals = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role, created_at
       FROM users
       WHERE role IN ('lawyer', 'investigator')
       ORDER BY created_at DESC
       LIMIT 100`
    );

    return res.status(200).json({
      success: true,
      professionals: result.rows,
    });
  } catch (error) {
    console.error("List professionals error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve professional accounts",
    });
  }
};

// GET /api/admin/cases/pending
const listPendingCases = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         c.id,
         c.case_number,
         c.title,
         c.description,
         c.status,
         c.created_by,
         creator.full_name AS professional_name,
         creator.email AS professional_email,
         creator.role AS professional_role,
         cc.client_id,
         client.full_name AS client_name,
         client.email AS client_email,
         ca.id AS approval_id,
         ca.created_at AS submitted_at
       FROM case_approvals ca
       INNER JOIN cases c ON c.id = ca.case_id
       INNER JOIN users creator ON creator.id = c.created_by
       LEFT JOIN case_clients cc
         ON cc.case_id = c.id AND cc.status = 'active'
       LEFT JOIN users client ON client.id = cc.client_id
       WHERE ca.status = 'pending'
         AND c.status = 'pending_approval'
       ORDER BY ca.created_at ASC
       LIMIT 100`
    );

    return res.status(200).json({
      success: true,
      total: result.rows.length,
      cases: result.rows,
    });
  } catch (error) {
    console.error("List pending cases error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve pending cases",
    });
  }
};

const reviewCaseSchema = z.object({
  action: z.enum(["approve", "reject", "request_changes"]),
  comments: z.string().trim().max(2000).optional(),
}).strict().superRefine((data, ctx) => {
  if (
    ["reject", "request_changes"].includes(data.action) &&
    (!data.comments || data.comments.length < 10)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["comments"],
      message: "At least 10 characters of comments are required",
    });
  }
});

// PATCH /api/admin/cases/:id/review
const reviewCase = async (req, res) => {
  const idValidation = z.string().uuid().safeParse(req.params.id);

  if (!idValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid case ID",
    });
  }

  const validation = reviewCaseSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid review details",
      errors: validation.error.flatten(),
    });
  }

  const { action, comments } = validation.data;
  const adminId = req.user.id;
  const caseId = req.params.id;

  const statusMap = {
    approve: {
      caseStatus: "active",
      approvalStatus: "approved",
    },
    reject: {
      caseStatus: "rejected",
      approvalStatus: "rejected",
    },
    request_changes: {
      caseStatus: "changes_requested",
      approvalStatus: "changes_requested",
    },
  };

  const newStatus = statusMap[action];

  const db = await pool.connect();
  let transactionStarted = false;

  try {
    await db.query("BEGIN");
    transactionStarted = true;

    // Lock the pending approval and its associated case.
    const approvalResult = await db.query(
      `SELECT
         ca.id AS approval_id,
         ca.status AS approval_status,
         c.id AS case_id,
         c.status AS case_status
       FROM case_approvals ca
       INNER JOIN cases c ON c.id = ca.case_id
       WHERE ca.case_id = $1
       FOR UPDATE OF ca, c`,
      [caseId]
    );

    if (approvalResult.rowCount === 0) {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Case approval record not found",
      });
    }

    const approval = approvalResult.rows[0];

    if (
      approval.approval_status !== "pending" ||
      approval.case_status !== "pending_approval"
    ) {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "This case is no longer awaiting approval",
        currentStatus: approval.case_status,
      });
    }

    // Update the approval record with the Admin's decision.
    const updatedApproval = await db.query(
      `UPDATE case_approvals
       SET
         admin_id = $1,
         status = $2,
         comments = $3,
         reviewed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [
        adminId,
        newStatus.approvalStatus,
        comments || null,
        approval.approval_id,
      ]
    );

    // Update the formal case status.
    const updatedCase = await db.query(
      `UPDATE cases
       SET
         status = $1,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING
         id,
         case_number,
         title,
         status,
         updated_at`,
      [newStatus.caseStatus, caseId]
    );

    // Record the Admin's decision in the audit log.
    await recordAuditLog(
      {
        actorId: adminId,
        action: `CASE_${newStatus.approvalStatus.toUpperCase()}`,
        entityType: "case",
        entityId: caseId,
        details: {
          approvalId: approval.approval_id,
          previousStatus: approval.case_status,
          newStatus: newStatus.caseStatus,
          comments: comments || null,
        },
        ...getRequestAuditMetadata(req),
      },
      { client: db }
    );

    await db.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: `Case ${newStatus.approvalStatus} successfully`,
      case: updatedCase.rows[0],
      approval: updatedApproval.rows[0],
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Case review rollback error:", rollbackError);
      }
    }

    console.error("Review case error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to review case",
    });
  } finally {
    db.release();
  }
};

// POST /api/admin/cases/:id/assign
const assignProfessional = async (req, res) => {
  const caseValidation = z.string().uuid().safeParse(req.params.id);

  if (!caseValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid case ID",
    });
  }

  const validation = assignProfessionalSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid assignment details",
      errors: validation.error.issues,
    });
  }

  const caseId = req.params.id;
  const { professional_id } = validation.data;
  const adminId = req.user.id;

  const db = await pool.connect();
  let transactionStarted = false;

  try {
    await db.query("BEGIN");
    transactionStarted = true;

    // Lock the case to serialize assignment creation for this case.
    const caseResult = await db.query(
      `SELECT id, status
       FROM cases
       WHERE id = $1
       FOR UPDATE`,
      [caseId]
    );

    if (caseResult.rowCount === 0) {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Case not found",
      });
    }

    // Verify that the selected professional exists.
    const professionalResult = await db.query(
      `SELECT id, full_name, email, role
       FROM users
       WHERE id = $1
         AND role IN ('lawyer', 'investigator')`,
      [professional_id]
    );

    if (professionalResult.rowCount === 0) {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Professional not found",
      });
    }

    const professional = professionalResult.rows[0];

    // Only allow assignments for cases that can receive professional work.
const assignableStatuses = ["changes_requested", "active"];

if (!assignableStatuses.includes(caseResult.rows[0].status)) {
  await db.query("ROLLBACK");
  transactionStarted = false;

  return res.status(409).json({
    success: false,
    message: "Professional assignment is not allowed for this case status",
    caseStatus: caseResult.rows[0].status,
    allowedStatuses: assignableStatuses,
  });
}

    // Prevent duplicate pending or accepted assignments.
    const existingAssignment = await db.query(
      `SELECT id, status
       FROM case_assignments
       WHERE case_id = $1
         AND professional_id = $2
         AND status IN ('pending_acceptance', 'accepted')
       LIMIT 1`,
      [caseId, professional_id]
    );

    if (existingAssignment.rowCount > 0) {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "Professional already has an active or pending assignment",
        assignment: existingAssignment.rows[0],
      });
    }

    // Create assignment awaiting professional acceptance.
    const assignmentResult = await db.query(
      `INSERT INTO case_assignments (
         case_id,
         professional_id,
         assigned_by,
         role,
         status
       )
       VALUES ($1, $2, $3, $4, 'pending_acceptance')
       RETURNING *`,
      [caseId, professional_id, adminId, professional.role]
    );

    const assignment = assignmentResult.rows[0];

    await recordAuditLog(
      {
        actorId: adminId,
        action: "CASE_PROFESSIONAL_ASSIGNED",
        entityType: "case",
        entityId: caseId,
        details: {
          assignmentId: assignment.id,
          professionalId: professional.id,
          professionalEmail: professional.email,
          professionalRole: professional.role,
          assignmentStatus: "pending_acceptance",
        },
        ...getRequestAuditMetadata(req),
      },
      { client: db }
    );

    await db.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Professional assignment created and awaiting acceptance",
      assignment,
    });
  }   catch (error) {
    if (transactionStarted) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Assignment rollback failed");
      }
    }

    console.error("Assign professional error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to assign professional",
    });
  } finally {
    db.release();
  }
};


// GET /api/admin/assignments
const listAssignments = async (req, res) => {
  try {
    const [assignmentsResult, countsResult] = await Promise.all([
      pool.query(
        `SELECT
           ca.id,
           ca.case_id,
           ca.professional_id,
           ca.assigned_by,
           ca.role,
           ca.status,
           ca.assigned_at,
           ca.responded_at,
           ca.updated_at,

           c.case_number,
           c.title AS case_title,
           c.status AS case_status,

           professional.full_name AS professional_name,
           professional.email AS professional_email,

           admin.full_name AS assigned_by_name,
           admin.email AS assigned_by_email

         FROM case_assignments ca

         INNER JOIN cases c
           ON c.id = ca.case_id

         INNER JOIN users professional
           ON professional.id = ca.professional_id

         LEFT JOIN users admin
           ON admin.id = ca.assigned_by

         ORDER BY ca.assigned_at DESC
         LIMIT 200`
      ),

      pool.query(
        `SELECT
           status,
           COUNT(*)::int AS total
         FROM case_assignments
         GROUP BY status`
      ),
    ]);

    const counts = {
      pending_acceptance: 0,
      accepted: 0,
      declined: 0,
      revoked: 0,
    };

    for (const row of countsResult.rows) {
      if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
        counts[row.status] = row.total;
      }
    }

    return res.status(200).json({
      success: true,
      total: assignmentsResult.rows.length,
      counts,
      assignments: assignmentsResult.rows,
    });
  } catch (error) {
    console.error("List assignments error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve assignment records",
    });
  }
};

module.exports = {
  createProfessional,
  listProfessionals,
  listPendingCases,
  reviewCase,
  assignProfessional,
  listAssignments,
};
