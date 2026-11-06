
require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("../src/config/db");

const createFirstAdmin = async () => {
  const fullName = process.env.INITIAL_ADMIN_NAME?.trim();
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  // Validate setup configuration
  if (!fullName || !email || !password) {
    throw new Error(
      "INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be configured."
    );
  }

  if (fullName.length < 2 || fullName.length > 100) {
    throw new Error("Admin name must contain 2-100 characters.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid Admin email address.");
  }

  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Admin password must be at least 12 characters and no more than 72 bytes.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Prevent concurrent first-admin setup attempts.
    await client.query("SELECT pg_advisory_xact_lock($1)", [261190]);

    const existingAdmin = await client.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (existingAdmin.rows.length > 0) {
      throw new Error(
        "An Admin account already exists. First-admin setup is disabled."
      );
    }

    const existingEmail = await client.query(
      "SELECT id FROM users WHERE LOWER(email) = $1",
      [email]
    );

    if (existingEmail.rows.length > 0) {
      throw new Error(
        "This email already belongs to an account. Use a different email address."
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await client.query(
      `INSERT INTO users (
        full_name,
        email,
        password_hash,
        role
      )
      VALUES ($1, $2, $3, 'admin')
      RETURNING id, full_name, email, role, created_at`,
      [fullName, email, passwordHash]
    );

    await client.query("COMMIT");

    console.log("\nFirst Admin account created successfully.");
    console.log("Account details:");

    console.table(result.rows);

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
    await pool.end();
  }
};

createFirstAdmin().catch((error) => {
  console.error("\nAdmin setup failed:", error.message);
  process.exitCode = 1;
});
