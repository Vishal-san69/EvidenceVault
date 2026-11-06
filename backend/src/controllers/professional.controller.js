const { z } = require("zod");
const pool = require("../config/db");

const directoryQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["lawyer", "investigator"]).optional(),
});

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

module.exports = { listPublicProfessionals };