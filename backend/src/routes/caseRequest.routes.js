const express = require("express");
const authenticateToken = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");

const {
  createCaseRequest,
  getReceivedCaseRequests,
  reviewCaseRequest,
} = require("../controllers/caseRequest.controller");

const router = express.Router();

// All endpoints require authentication.
router.use(authenticateToken);

// Client submits a case request.
router.post(
  "/",
  requireRole("client"),
  createCaseRequest
);

// Lawyers and investigators view incoming requests.
router.get(
  "/received",
  requireRole("lawyer", "investigator"),
  getReceivedCaseRequests
);

// Lawyers and investigators review incoming requests.
router.patch(
  "/:id/review",
  requireRole("lawyer", "investigator"),
  reviewCaseRequest
);

module.exports = router;