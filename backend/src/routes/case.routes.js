const express = require("express");

const authenticateToken = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");

const {
  getCases,
  getCaseById,
  updateCase,
  resubmitCase,
} = require("../controllers/case.controller");

const router = express.Router();

// All case endpoints require authentication.
router.use(authenticateToken);

// List cases accessible to the authenticated user.
router.get("/", getCases);

// Retrieve one case after checking access.
router.get("/:id", getCaseById);

// Update case details after Admin requests changes.
router.patch(
  "/:id",
  requireRole("lawyer", "investigator"),
  updateCase
);

// Resubmit corrected case for Admin approval.
router.post(
  "/:id/resubmit",
  requireRole("lawyer", "investigator"),
  resubmitCase
);

module.exports = router;