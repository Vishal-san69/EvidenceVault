
const express = require("express");

const authenticateToken = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");


const {
  createProfessional,
  listProfessionals,
  listPendingCases,
  reviewCase,
} = require("../controllers/admin.controller");

const router = express.Router();

// All routes in this router require Admin access.
router.use(authenticateToken);
router.use(requireRole("admin"));

router.post("/professionals", createProfessional);
router.get("/professionals", listProfessionals);

// Admin reviews pending formal cases.
router.get("/cases/pending", listPendingCases);

// Admin approves, rejects, or requests changes.
router.patch("/cases/:id/review", reviewCase);

module.exports = router;
