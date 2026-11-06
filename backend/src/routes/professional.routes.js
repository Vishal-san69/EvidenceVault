
const express = require("express");
const authenticateToken = require("../middleware/auth.middleware");

const {
  listPublicProfessionals,
} = require("../controllers/professional.controller");

const router = express.Router();

// Only authenticated users can browse professionals
router.get(
  "/",
  authenticateToken,
  listPublicProfessionals
);

module.exports = router;
