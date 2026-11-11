
const express = require("express");

const authenticateToken = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");

const {
  createProfessional,
  listProfessionals,
  listPendingCases,
  reviewCase,
  assignProfessional,
  listAssignments,
} = require("../controllers/admin.controller");

const router = express.Router();

// All routes in this router require Admin access.
router.use(authenticateToken);
router.use(requireRole("admin"));

// Professional management.
router.post("/professionals", createProfessional);
router.get("/professionals", listProfessionals);

// Case management.
router.get("/cases/pending", listPendingCases);
router.patch("/cases/:id/review", reviewCase);

// Assignment management.
router.get("/assignments", listAssignments);
router.post("/cases/:id/assign", assignProfessional);

module.exports = router;
