
const { z } = require("zod");
const pool = require("../config/db");

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
  const idValidation = z.string().uuid().safeParse(req.params.id);

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

    return res.status(200).json({
      success: true,
      case: result.rows[0],
    });
  } catch (error) {
    console.error("Get case details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve case details",
    });
  }
};

module.exports = {
  getCases,
  getCaseById,
};
