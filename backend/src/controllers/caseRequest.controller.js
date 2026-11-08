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

const { randomUUID } = require("crypto");

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

const getCaseRequestResponses = async (req, res) => {
  // Validate the case request ID.
  const idValidation = z.string().uuid().safeParse(req.params.id);

  if (!idValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid case request ID",
    });
  }

  try {
    const requestId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify that the current user owns or received this request.
    const accessResult = await pool.query(
      `SELECT id
       FROM case_requests
       WHERE id = $1
         AND (
           (client_id = $2 AND $3 = 'client')
           OR
           (professional_id = $2 AND $3 IN ('lawyer', 'investigator'))
         )`,
      [requestId, userId, userRole]
    );

    // Return 404 for both nonexistent and unauthorized requests.
    if (accessResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Case request not found",
      });
    }

    // Retrieve the response history in chronological order.
    const historyResult = await pool.query(
      `SELECT
         crr.id,
         crr.request_id,
         crr.professional_id,
         u.full_name AS professional_name,
         crr.previous_status,
         crr.new_status,
         crr.action,
         crr.response_message,
         crr.created_at
       FROM case_request_responses crr
       INNER JOIN users u ON u.id = crr.professional_id
       WHERE crr.request_id = $1
       ORDER BY crr.created_at ASC`,
      [requestId]
    );

    return res.status(200).json({
      success: true,
      total: historyResult.rows.length,
      responses: historyResult.rows,
    });
  } catch (error) {
    console.error("Get case request responses error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve response history",
    });
  }
};

const convertCaseRequest = async (req, res) => {
  const idValidation = z.string().uuid().safeParse(req.params.id);

  if (!idValidation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid case request ID",
    });
  }

  const professionalId = req.user.id;
  const professionalRole = req.user.role;
  const requestId = req.params.id;

  const db = await pool.connect();
  let transactionStarted = false;

  try {
    await db.query("BEGIN");
    transactionStarted = true;

    // Lock the request and verify professional ownership.
    const requestResult = await db.query(
      `SELECT
         id,
         client_id,
         professional_id,
         requested_case_title,
         description,
         status,
         converted_case_id
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

    const caseRequest = requestResult.rows[0];

    // Only accepted requests can become formal cases.
    if (caseRequest.status !== "accepted") {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "Only accepted requests can be converted into cases",
        currentStatus: caseRequest.status,
      });
    }

    if (caseRequest.converted_case_id) {
      await db.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "This request has already been converted",
        caseId: caseRequest.converted_case_id,
      });
    }

    // Generate a unique case ID and human-readable case number.
    const caseId = randomUUID();
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const caseNumber = `EV-${datePart}-${caseId.slice(0, 8).toUpperCase()}`;

    // Create the formal case in pending approval status.
    const caseResult = await db.query(
      `INSERT INTO cases (
         id,
         case_number,
         title,
         description,
         status,
         created_by
       )
       VALUES ($1, $2, $3, $4, 'pending_approval', $5)
       RETURNING
         id,
         case_number,
         title,
         description,
         status,
         created_by,
         created_at`,
      [
        caseId,
        caseNumber,
        caseRequest.requested_case_title,
        caseRequest.description,
        professionalId,
      ]
    );

    const newCase = caseResult.rows[0];

    // Link the original client to the formal case.
    await db.query(
      `INSERT INTO case_clients (
         case_id,
         client_id,
         linked_by,
         status
       )
       VALUES ($1, $2, $3, 'active')`,
      [caseId, caseRequest.client_id, professionalId]
    );

    // The professional already accepted the original request.
    // Therefore, create an accepted assignment.
    await db.query(
      `INSERT INTO case_assignments (
         case_id,
         professional_id,
         assigned_by,
         role,
         status,
         responded_at
       )
       VALUES ($1, $2, $2, $3, 'accepted', CURRENT_TIMESTAMP)`,
      [caseId, professionalId, professionalRole]
    );

    // Submit the newly created case for Admin approval.
    await db.query(
      `INSERT INTO case_approvals (
         case_id,
         status
       )
       VALUES ($1, 'pending')`,
      [caseId]
    );

    // Link the original request to the new formal case.
    await db.query(
      `UPDATE case_requests
       SET
         status = 'converted_to_case',
         converted_case_id = $1,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [caseId, requestId]
    );

    // Record the complete conversion in the audit log.
    await recordAuditLog(
      {
        actorId: professionalId,
        action: "CASE_REQUEST_CONVERTED",
        entityType: "case",
        entityId: caseId,
        details: {
          requestId,
          clientId: caseRequest.client_id,
          caseNumber,
          professionalRole,
          initialStatus: "pending_approval",
        },
        ...getRequestAuditMetadata(req),
      },
      { client: db }
    );

    await db.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Case created and submitted for Admin approval",
      case: newCase,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Case conversion rollback error:", rollbackError);
      }
    }

    console.error("Convert case request error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to convert case request",
    });
  } finally {
    db.release();
  }
};

module.exports = {
  createCaseRequest,
  getReceivedCaseRequests,
  reviewCaseRequest,
  getCaseRequestResponses,
  convertCaseRequest,
};