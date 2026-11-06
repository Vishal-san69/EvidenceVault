
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

module.exports = {
  createProfessional,
  listProfessionals,
};
