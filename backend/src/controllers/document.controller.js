
const { randomUUID } = require("crypto");
const path = require("path");
const { z } = require("zod");

const pool = require("../config/db");

const {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
} = require("../config/document.config");

const {
  generateUploadUrl,
  verifyUploadedObject,
  generateDownloadUrl,
  deleteS3Object,
} = require("../services/s3.service");

// Upload validation
const uploadSchema = z.object({
  original_name: z.string().trim().min(1).max(255),
  content_type: z.string().min(1),
  file_size_bytes: z.number().int().positive().max(MAX_FILE_SIZE),
});

// ============================================================
// 1. REQUEST UPLOAD URL
// ============================================================

const requestUpload = async (req, res) => {
  try {
    const validation = uploadSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid upload details",
        errors: validation.error.issues,
      });
    }

    const {
      original_name,
      content_type,
      file_size_bytes,
    } = validation.data;

    const extension = path.extname(original_name).toLowerCase();

    const allowedTypes = ALLOWED_FILE_TYPES[extension];

    if (!allowedTypes || !allowedTypes.includes(content_type)) {
      return res.status(400).json({
        success: false,
        message: "File type is not supported",
      });
    }

    // Generate a unique S3 object key
    const key = `users/${req.user.id}/${randomUUID()}${extension}`;

    // Generate presigned upload URL
    const uploadUrl = await generateUploadUrl({
      key,
      contentType: content_type,
    });

    // Create pending document record
    const result = await pool.query(
      `INSERT INTO documents
       (
         user_id,
         original_name,
         s3_key,
         content_type,
         file_size_bytes,
         status
       )
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING
         id,
         original_name,
         content_type,
         file_size_bytes,
         status,
         created_at`,
      [
        req.user.id,
        original_name,
        key,
        content_type,
        file_size_bytes,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Upload URL generated",
      document: result.rows[0],
      upload_url: uploadUrl,
      upload_method: "PUT",
      expires_in: 300,
    });
  } catch (error) {
    console.error("Upload URL error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create upload URL",
    });
  }
};

// ============================================================
// 2. CONFIRM UPLOAD
// ============================================================

const confirmUpload = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT *
       FROM documents
       WHERE id = $1
         AND user_id = $2
         AND status = 'pending'`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending document not found",
      });
    }

    const document = result.rows[0];

    // Verify uploaded object in S3
    const object = await verifyUploadedObject(document.s3_key);

    const isValid =
      Number(object.ContentLength) ===
        Number(document.file_size_bytes) &&
      object.ContentType === document.content_type &&
      object.ServerSideEncryption === "AES256";

    if (!isValid) {
      await deleteS3Object(document.s3_key);

      await pool.query(
        `DELETE FROM documents
         WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );

      return res.status(400).json({
        success: false,
        message: "Uploaded file failed verification",
      });
    }

    // Mark document as active
    const updated = await pool.query(
      `UPDATE documents
       SET status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND user_id = $2
       RETURNING
         id,
         original_name,
         content_type,
         file_size_bytes,
         status,
         created_at`,
      [id, req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: "Document uploaded and verified",
      document: updated.rows[0],
    });
  } catch (error) {
    console.error("Upload confirmation error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify uploaded document",
    });
  }
};

// ============================================================
// 3. LIST MY DOCUMENTS
// ============================================================

const getMyDocuments = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id,
         original_name,
         content_type,
         file_size_bytes,
         status,
         created_at
       FROM documents
       WHERE user_id = $1
         AND status = 'active'
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      documents: result.rows,
    });
  } catch (error) {
    console.error("List documents error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve documents",
    });
  }
};

// ============================================================
// 4. REQUEST DOWNLOAD URL
// ============================================================

const requestDownload = async (req, res) => {
  try {
    const { id } = req.params;

    // Check document ownership and status
    const result = await pool.query(
      `SELECT
         id,
         original_name,
         s3_key,
         content_type
       FROM documents
       WHERE id = $1
         AND user_id = $2
         AND status = 'active'`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const document = result.rows[0];

    // Pass original filename to force browser download
    const downloadUrl = await generateDownloadUrl(
      document.s3_key,
      document.original_name
    );

    return res.status(200).json({
      success: true,
      message: "Download URL generated",
      download_url: downloadUrl,
      filename: document.original_name,
      expires_in: 300,
    });
  } catch (error) {
    console.error("Download URL error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to generate download URL",
    });
  }
};

// ============================================================
// 5. DELETE DOCUMENT
// ============================================================

const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership and document status
    const result = await pool.query(
      `SELECT id, s3_key
       FROM documents
       WHERE id = $1
         AND user_id = $2
         AND status = 'active'`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const document = result.rows[0];

    // Delete object from S3
    await deleteS3Object(document.s3_key);

    // Update database status
    await pool.query(
      `UPDATE documents
       SET status = 'deleted',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND user_id = $2`,
      [id, req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("Delete document error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete document",
    });
  }
};

// ============================================================
// EXPORT CONTROLLERS
// ============================================================

module.exports = {
  requestUpload,
  confirmUpload,
  getMyDocuments,
  requestDownload,
  deleteDocument,
};
