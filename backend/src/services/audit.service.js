
const pool = require("../config/db");

/**
 * Record a security-sensitive action in audit_logs.
 *
 * @param {Object} event
 * @param {string|null} event.actorId - User performing the action
 * @param {string} event.action - Action name
 * @param {string} event.entityType - Resource type
 * @param {string|null} event.entityId - Resource UUID
 * @param {Object} event.details - Additional event metadata
 * @param {string|null} event.ipAddress - Request IP
 * @param {string|null} event.userAgent - Client user agent
 * @param {Object} [options] - Optional PostgreSQL client for transactions
 */
const recordAuditLog = async (event, options = {}) => {
  const {
    actorId = null,
    action,
    entityType,
    entityId = null,
    details = {},
    ipAddress = null,
    userAgent = null,
  } = event || {};

  // Validate required fields
  if (
    typeof action !== "string" ||
    !action.trim() ||
    typeof entityType !== "string" ||
    !entityType.trim()
  ) {
    throw new Error("Audit action and entity type are required");
  }

  if (
    !details ||
    typeof details !== "object" ||
    Array.isArray(details)
  ) {
    throw new Error("Audit details must be a JSON object");
  }

  const db = options.client || pool;

  const result = await db.query(
    `INSERT INTO audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      details,
      ip_address,
      user_agent
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
    RETURNING id, actor_id, action, entity_type, entity_id, created_at`,
    [
      actorId,
      action.trim(),
      entityType.trim(),
      entityId,
      JSON.stringify(details),
      ipAddress,
      userAgent,
    ]
  );

  return result.rows[0];
};

/**
 * Extract request metadata for audit events.
 */
const getRequestAuditMetadata = (req) => ({
  ipAddress: req.ip || null,
  userAgent: req.get("user-agent") || null,
});

module.exports = {
  recordAuditLog,
  getRequestAuditMetadata,
};
