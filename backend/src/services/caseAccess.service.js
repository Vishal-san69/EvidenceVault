
const pool = require("../config/db");

/**
 * Check whether a user can access a case.
 *
 * Admin: any existing case.
 * Client: active client-case relationship.
 * Lawyer/investigator: accepted professional assignment.
 *
 * Returns false for unauthorized or nonexistent cases.
 */
const canAccessCase = async (user, caseId, db = pool) => {
  if (!user?.id || !user?.role || !caseId) {
    return false;
  }

  if (user.role === "admin") {
    const result = await db.query(
      `SELECT 1 FROM cases WHERE id = $1`,
      [caseId]
    );

    return result.rowCount > 0;
  }

  if (user.role === "client") {
    const result = await db.query(
      `SELECT 1
       FROM case_clients
       WHERE case_id = $1
         AND client_id = $2
         AND status = 'active'
       LIMIT 1`,
      [caseId, user.id]
    );

    return result.rowCount > 0;
  }

  if (user.role === "lawyer" || user.role === "investigator") {
    const result = await db.query(
      `SELECT 1
       FROM case_assignments
       WHERE case_id = $1
         AND professional_id = $2
         AND role = $3
         AND status = 'accepted'
       LIMIT 1`,
      [caseId, user.id, user.role]
    );

    return result.rowCount > 0;
  }

  return false;
};

module.exports = { canAccessCase };
