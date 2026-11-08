const express = require("express");
const authenticateToken = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");

const {
  createCaseRequest,
  getReceivedCaseRequests,
  reviewCaseRequest,
  getCaseRequestResponses,
  convertCaseRequest,
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

// Clients and assigned professionals view response history.
router.get(
  "/:id/responses",
  requireRole("client", "lawyer", "investigator"),
  getCaseRequestResponses
);

// Convert an accepted request into a formal case.
router.post(
  "/:id/convert",
  requireRole("lawyer", "investigator"),
  convertCaseRequest
);

module.exports = router;