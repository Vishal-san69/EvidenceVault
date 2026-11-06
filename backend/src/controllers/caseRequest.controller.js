const { z } = require("zod");
const pool = require("../config/db");
const {
  recordAuditLog,
  getRequestAuditMetadata,
} = require("../services/audit.service");

const createCaseRequestSchema = z.object({
  professional_id: z.string().uuid(),
  requested_case_title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(20).max(5000),
});

const createCaseRequest = async (req, res) => {
  const validation = createCaseRequestSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid case request details",
      errors: validation.error.flatten(),
    });
  }

  const { professional_id, requested_case_title, description } =
    validation.data;

  const clientId = req.user.id;
  const db = await pool.connect();

  try {
    await db.query("BEGIN");

    // Verify that the selected professional exists and has a valid role.
    const professionalResult = await db.query(
      `SELECT id, role
       FROM users
       WHERE id = $1
         AND role IN ('lawyer', 'investigator')`,
      [professional_id]
    );

    if (professionalResult.rowCount === 0) {
      await db.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Selected professional was not found",
      });
    }

    // Prevent clients from requesting their own professional account.
    if (clientId === professional_id) {
      await db.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "You cannot submit a request to yourself",
      });
    }

    // Verify that the authenticated account is a client.
    const clientResult = await db.query(
      `SELECT id
       FROM users
       WHERE id = $1 AND role = 'client'`,
      [clientId]
    );

    if (clientResult.rowCount === 0) {
      await db.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "Only clients can submit case requests",
      });
    }

    const requestResult = await db.query(
      `INSERT INTO case_requests (
        client_id,
        professional_id,
        requested_case_title,
        description
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        client_id,
        professional_id,
        requested_case_title,
        description,
        status,
        created_at`,
      [
        clientId,
        professional_id,
        requested_case_title,
        description,
      ]
    );

    const caseRequest = requestResult.rows[0];

    await recordAuditLog(
      {
        actorId: clientId,
        action: "CASE_REQUEST_CREATED",
        entityType: "case_request",
        entityId: caseRequest.id,
        details: {
          professionalId: professional_id,
          requestedCaseTitle: requested_case_title,
        },
        ...getRequestAuditMetadata(req),
      },
      { client: db }
    );

    await db.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Case request submitted successfully",
      caseRequest,
    });
  } catch (error) {
    await db.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "You already have an active request with this professional",
      });
    }

    console.error("Create case request error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit case request",
    });
  } finally {
    db.release();
  }
};

const getReceivedCaseRequests = async (req, res) => {
  try {
    const { status } = req.query;

    const allowedStatuses = [
      "pending",
      "under_review",
      "needs_information",
      "accepted",
      "rejected",
      "converted_to_case",
      "withdrawn",
    ];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request status",
      });
    }

    const values = [req.user.id];

    let query = `
      SELECT
        cr.id,
        cr.client_id,
        u.full_name AS client_name,
        u.email AS client_email,
        cr.professional_id,
        cr.requested_case_title,
        cr.description,
        cr.status,
        cr.professional_response,
        cr.created_at,
        cr.updated_at
      FROM case_requests cr
      INNER JOIN users u ON u.id = cr.client_id
      WHERE cr.professional_id = $1
    `;

    if (status) {
      values.push(status);
      query += ` AND cr.status = $${values.length}`;
    }

    query += ` ORDER BY cr.created_at DESC LIMIT 100`;

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      total: result.rows.length,
      requests: result.rows,
    });
  } catch (error) {
    console.error("Get received case requests error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve received case requests",
    });
  }
};

const reviewCaseRequestSchema = z.object({
  action: z.enum([
    "accept",
    "reject",
    "request_information",
  ]),
  response: z.string().trim().max(2000).optional(),
}).superRefine((data, ctx) => {
  if (
    ["reject", "request_information"].includes(data.action) &&
    (!data.response || data.response.length < 10)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["response"],
      message: "A response of at least 10 characters is required",
    });
  }
});


const reviewCaseRequest = async (req, res) => {
  // Validate request ID.
  const idValidation = z.string().uuid().safeParse(req.params.id);

  if (!idValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid case request ID",
    });
  }

  // Validate review action and response.
  const validation = reviewCaseRequestSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid review details",
      errors: validation.error.flatten(),
    });
  }

  const { action, response } = validation.data;

  const statusMap = {
    accept: "accepted",
    reject: "rejected",
    request_information: "needs_information",
  };

  const newStatus = statusMap[action];
  const professionalId = req.user.id;
  const requestId = req.params.id;

  const db = await pool.connect();
  let transactionStarted = false;

  try {
    await db.query("BEGIN");
    transactionStarted = true;

    // Lock the request and verify professional ownership.
    const requestResult = await db.query(
      `SELECT id, status
       FROM case_requests
       WHERE id = $1
         AND professional_id = $2
       FOR UPDATE`,
      [requestId, professionalId]
    );

    if (requestResult.rowCount === 0) {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Case request not found",
      });
    }

    const existingRequest = requestResult.rows[0];

    const reviewableStatuses = [
      "pending",
      "under_review",
      "needs_information",
    ];

    if (!reviewableStatuses.includes(existingRequest.status)) {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "This case request can no longer be reviewed",
        currentStatus: existingRequest.status,
      });
    }

    const updateResult = await db.query(
      `UPDATE case_requests
       SET
         status = $1,
         professional_response = $2,
         reviewed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING
         id,
         client_id,
         professional_id,
         requested_case_title,
         status,
         professional_response,
         reviewed_at,
         updated_at`,
      [newStatus, response || null, requestId]
    );

    const updatedRequest = updateResult.rows[0];

    // Save the professional's decision in response history.
    await db.query(
      `INSERT INTO case_request_responses (
         request_id,
         professional_id,
         previous_status,
         new_status,
         action,
         response_message
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        requestId,
        professionalId,
        existingRequest.status,
        newStatus,
        action,
        response || null,
      ]
    );

    // Record the review in the audit log.
    await recordAuditLog(
      {
        actorId: professionalId,
        action: `CASE_REQUEST_${newStatus.toUpperCase()}`,
        entityType: "case_request",
        entityId: requestId,
        details: {
          previousStatus: existingRequest.status,
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
      message: `Case request ${newStatus.replaceAll("_", " ")} successfully`,
      caseRequest: updatedRequest,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Review rollback error:", rollbackError);
      }
    }

    console.error("Review case request error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to review case request",
    });
  } finally {
    db.release();
  }
};


module.exports = {
  createCaseRequest,
  getReceivedCaseRequests,
  reviewCaseRequest,
};

