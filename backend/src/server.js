
require("dotenv").config();

const caseRoutes = require("./routes/case.routes");
const caseRequestRoutes = require("./routes/caseRequest.routes");
const professionalRoutes = require("./routes/professional.routes");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const adminRoutes = require("./routes/admin.routes");
const pool = require("./config/db");
const { checkS3Connection } = require("./config/s3");

const authRoutes = require("./routes/auth.routes");
const documentRoutes = require("./routes/document.routes");

const authenticateToken = require("./middleware/auth.middleware");
const requireRole = require("./middleware/role.middleware");

const app = express();

// Security middleware
app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL,
  })
);

app.use(express.json({ limit: "1mb" }));

// API rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

// Authentication routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
// Document routes
app.use("/api/documents", documentRoutes);
app.use("/api/professionals", professionalRoutes);
app.use("/api/case-requests", caseRequestRoutes);
app.use("/api/cases", caseRoutes);

// Health check
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      success: true,
      message: "EvidenceVault API is running",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// Temporary Admin-only RBAC test endpoint
app.get(
  "/api/test/admin",
  authenticateToken,
  requireRole("admin"),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Admin authorization successful",
      user: req.user,
    });
  }
);

// Start server
const PORT = process.env.PORT || 5001;

app.listen(PORT, async () => {
  console.log(`EvidenceVault API running on port ${PORT}`);

  await checkS3Connection();
});



