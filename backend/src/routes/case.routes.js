
const express = require("express");

const authenticateToken = require("../middleware/auth.middleware");

const {
  getCases,
  getCaseById,
} = require("../controllers/case.controller");

const router = express.Router();

// All case endpoints require authentication.
router.use(authenticateToken);

// List cases accessible to the authenticated user.
router.get("/", getCases);

// Retrieve one case after checking access.
router.get("/:id", getCaseById);

module.exports = router;
