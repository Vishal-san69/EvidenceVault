
const express = require("express");

const authenticateToken = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");

const {
  createProfessional,
  listProfessionals,
} = require("../controllers/admin.controller");

const router = express.Router();

// All routes in this router require Admin access.
router.use(authenticateToken);
router.use(requireRole("admin"));

router.post("/professionals", createProfessional);
router.get("/professionals", listProfessionals);

module.exports = router;
