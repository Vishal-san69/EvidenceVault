
const express = require("express");
const authenticateToken = require("../middleware/auth.middleware");

const {
  listPublicProfessionals,
  getMyAssignments,
  respondToAssignment,
} = require("../controllers/professional.controller");
const router = express.Router();

// Only authenticated users can browse professionals.
router.get(
  "/",
  authenticateToken,
  listPublicProfessionals
);

// Authenticated professionals can view their own assignments.
router.get(
  "/assignments",
  authenticateToken,
  getMyAssignments
);
// Authenticated professionals can respond to their own assignments.
// Role and ownership checks are performed inside the controller.
router.patch(
  "/assignments/:id/respond",
  authenticateToken,
  respondToAssignment
);

module.exports = router;
