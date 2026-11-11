
const express = require("express");

const authenticateToken = require("../middleware/auth.middleware");

const {
  requestUpload,
  confirmUpload,
  getMyDocuments,
  getCaseDocuments,
  requestDownload,
  deleteDocument,
} = require("../controllers/document.controller");

const router = express.Router();

router.use(authenticateToken);

// Upload and verification
router.post("/upload-url", requestUpload);
router.post("/:id/confirm", confirmUpload);

// Document listing
router.get("/my-documents", getMyDocuments);
router.get("/cases/:caseId", getCaseDocuments);

// Download and deletion
router.get("/:id/download-url", requestDownload);
router.delete("/:id", deleteDocument);

module.exports = router;
