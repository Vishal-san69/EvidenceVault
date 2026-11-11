
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

const { canAccessCase } = require("../services/caseAccess.service");

const {
  recordAuditLog,
  getRequestAuditMetadata,
} = require("../services/audit.service");

// ============================================================
// VALIDATION
// ============================================================

const uploadSchema = z.object({
  original_name: z.string().trim().min(1).max(255),
  content_type: z.string().trim().min(1).max(150),
  file_size_bytes: z.number().int().positive().max(MAX_FILE_SIZE),
  case_id: z.string().uuid().nullable().optional(),
});

const uuidSchema = z.string().uuid();

const isValidUUID = (value) => uuidSchema.safeParse(value).success;

// Audit failures should be logged without falsely reporting that
// an already-completed S3 operation failed.
const writeAuditLog = async (req, action, documentId, details = {}) => {
  try {
    await recordAuditLog({
      actorId: req.user.id,
      action,
      entityType: "document",
      entityId: documentId,
      details,
      ...getRequestAuditMetadata(req),
    });
  } catch (error) {
    console.error("Document audit logging error:", error);
  }
};

// ============================================================
// 1. REQUEST UPLOAD URL
// POST /api/documents/upload-url
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
      case_id = null,
    } = validation.data;

    // Validate extension and MIME type.
    const extension = path.extname(original_name).toLowerCase();
    const allowedTypes = ALLOWED_FILE_TYPES[extension];

    if (!allowedTypes || !allowedTypes.includes(content_type)) {
      return res.status(400).json({
        success: false,
        message: "File type is not supported",
      });
    }

    // Verify access before creating a case-linked document.
    if (case_id) {
      const hasAccess = await canAccessCase(req.user, case_id);

      if (!hasAccess) {
        return res.status(404).json({
          success: false,
          message: "Case not found or access denied",
        });
      }
    }

    // Generate a unique private S3 key.
    const key = `users/${req.user.id}/${randomUUID()}${extension}`;
    // Create the pending database record.
    const result = await pool.query(
      `INSERT INTO documents (
         user_id,
         case_id,
         original_name,
         s3_key,
         content_type,
         file_size_bytes,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING
         id,
         case_id,
         original_name,
         content_type,
         file_size_bytes,
         status,
         created_at`,
      [
        req.user.id,
        case_id,
        original_name,
        key,
        content_type,
        file_size_bytes,
      ]
    );
 const document = result.rows[0];

    // Generate the five-minute presigned upload URL.
    let uploadUrl;

    try {
      uploadUrl = await generateUploadUrl({
        key,
        contentType: content_type,
      });
    } catch (error) {
      // Remove the pending record if URL generation fails.
      await pool.query(
        `DELETE FROM documents
         WHERE id = $1
           AND user_id = $2
           AND status = 'pending'`,
        [document.id, req.user.id]
      );

      throw error;
    }

    await writeAuditLog(
      req,
      "DOCUMENT_UPLOAD_REQUESTED",
      document.id,
      {
        original_name,
        content_type,
        file_size_bytes,
        case_id,
      }
    );

    return res.status(201).json({
      success: true,
      message: "Upload URL generated",
      document,
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
// POST /api/documents/:id/confirm
// ============================================================  
const confirmUpload = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Validate document UUID.
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID",
      });
    }

    // 2. Find the pending document belonging to this user.
    const result = await pool.query(
      `SELECT
         id,
         user_id,
         case_id,
         original_name,
         s3_key,
         content_type,
         file_size_bytes,
         status
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

    // 3. Recheck case access before activating the document.
    if (document.case_id) {
      const hasAccess = await canAccessCase(
        req.user,
        document.case_id
      );

      if (!hasAccess) {
        return res.status(404).json({
          success: false,
          message: "Case not found or access denied",
        });
      }
    }

    // 4. Verify that the object exists in S3.
    let object;

    try {
      object = await verifyUploadedObject(document.s3_key);
    } catch (error) {
      if (
        error.name === "NotFound" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Uploaded file not found in storage. Please upload the file before confirming.",
        });
      }

      // Unexpected AWS errors must not activate the document.
      throw error;
    }

    // 5. Compare actual S3 metadata against database metadata.
    const expectedSize = Number(document.file_size_bytes);
    const actualSize = Number(object.ContentLength);

    const sizeMatches =
      Number.isSafeInteger(expectedSize) &&
      Number.isSafeInteger(actualSize) &&
      expectedSize > 0 &&
      actualSize === expectedSize;

    const contentTypeMatches =
      object.ContentType === document.content_type;

    const encryptionMatches =
      object.ServerSideEncryption === "AES256";

    console.log("DOCUMENT VERIFICATION RESULT:", {
      documentId: document.id,
      expectedSize,
      actualSize,
      sizeMatches,
      expectedContentType: document.content_type,
      actualContentType: object.ContentType,
      contentTypeMatches,
      actualEncryption: object.ServerSideEncryption,
      encryptionMatches,
    });

    const isValid =
      sizeMatches &&
      contentTypeMatches &&
      encryptionMatches;

    // 6. Reject invalid uploads.
    if (!isValid) {
      console.error(
        "Document upload verification failed:",
        document.id
      );

      // Remove the invalid object from S3.
      await deleteS3Object(document.s3_key);

      // Remove its pending database record.
      await pool.query(
        `DELETE FROM documents
         WHERE id = $1
           AND user_id = $2
           AND status = 'pending'`,
        [id, req.user.id]
      );

      return res.status(400).json({
        success: false,
        message: "Uploaded file failed verification",
        verification: {
          sizeMatches,
          contentTypeMatches,
          encryptionMatches,
        },
      });
    }

    // 7. Activate only if the record is still pending.
    const updated = await pool.query(
      `UPDATE documents
       SET status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND user_id = $2
         AND status = 'pending'
       RETURNING
         id,
         case_id,
         original_name,
         content_type,
         file_size_bytes,
         status,
         created_at`,
      [id, req.user.id]
    );

    if (updated.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message: "Document could not be activated",
      });
    }

    const activeDocument = updated.rows[0];

    // 8. Record successful confirmation.
    await writeAuditLog(
      req,
      "DOCUMENT_UPLOAD_CONFIRMED",
      activeDocument.id,
      {
        original_name: activeDocument.original_name,
        case_id: activeDocument.case_id,
        file_size_bytes: activeDocument.file_size_bytes,
        content_type: activeDocument.content_type,
      }
    );

    // 9. Return success.
    return res.status(200).json({
      success: true,
      message: "Document uploaded and verified",
      document: activeDocument,
    });

  } catch (error) {
    console.error("Upload confirmation error:", {
      name: error.name,
      message: error.message,
      status: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
    });

    return res.status(500).json({
      success: false,
      message: "Unable to verify uploaded document",
    });
  }
};

// ============================================================
// 3. LIST MY PERSONAL DOCUMENTS
// GET /api/documents/my-documents
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
         AND case_id IS NULL
         AND status = 'active'
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      documents: result.rows,
    });
  } catch (error) {
    console.error("List personal documents error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve documents",
    });
  }
};

// ============================================================
// 4. LIST CASE DOCUMENTS
// GET /api/documents/cases/:caseId
// ============================================================

const getCaseDocuments = async (req, res) => {
  try {
    const { caseId } = req.params;

    if (!isValidUUID(caseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid case ID",
      });
    }

    const hasAccess = await canAccessCase(req.user, caseId);

    if (!hasAccess) {
      return res.status(404).json({
        success: false,
        message: "Case not found or access denied",
      });
    }

    const result = await pool.query(
      `SELECT
         id,
         case_id,
         user_id,
         original_name,
         content_type,
         file_size_bytes,
         status,
         created_at
       FROM documents
       WHERE case_id = $1
         AND status = 'active'
       ORDER BY created_at DESC`,
      [caseId]
    );

    return res.status(200).json({
      success: true,
      documents: result.rows,
    });
  } catch (error) {
    console.error("List case documents error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve case documents",
    });
  }
};

// ============================================================
// 5. REQUEST DOWNLOAD URL
// GET /api/documents/:id/download-url
// ============================================================

const requestDownload = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID",
      });
    }

    const result = await pool.query(
      `SELECT
         id,
         user_id,
         case_id,
         original_name,
         s3_key,
         content_type
       FROM documents
       WHERE id = $1
         AND status = 'active'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const document = result.rows[0];

    if (document.case_id) {
      // Case document: current case access is required.
      const hasAccess = await canAccessCase(
        req.user,
        document.case_id
      );

      if (!hasAccess) {
        return res.status(404).json({
          success: false,
          message: "Document not found or access denied",
        });
      }
    } else if (document.user_id !== req.user.id) {
      // Personal documents remain owner-only.
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const downloadUrl = await generateDownloadUrl(
      document.s3_key,
      document.original_name
    );

    await writeAuditLog(
      req,
      "DOCUMENT_DOWNLOAD_URL_GENERATED",
      document.id,
      {
        original_name: document.original_name,
        case_id: document.case_id,
      }
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
// 6. DELETE DOCUMENT
// DELETE /api/documents/:id
// ============================================================
const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Validate document ID.
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID",
      });
    }

    // 2. Find an active document.
    const result = await pool.query(
      `SELECT
         id,
         user_id,
         case_id,
         original_name,
         s3_key
       FROM documents
       WHERE id = $1
         AND status = 'active'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const document = result.rows[0];

    const isUploader = document.user_id === req.user.id;
    const isAdmin = req.user.role === "admin";

    // 3. Apply authorization rules.
    if (document.case_id) {
      // Case documents:
      // Only the uploader or an administrator can delete.
      const hasAccess = await canAccessCase(
        req.user,
        document.case_id
      );

      if (!hasAccess) {
        return res.status(404).json({
          success: false,
          message: "Document not found or access denied",
        });
      }

      if (!isUploader && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to delete this document",
        });
      }
    } else {
      // Personal documents:
      // Only the original uploader can delete.
      if (!isUploader) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }
    }

    // 4. Delete the S3 object.
    // With bucket versioning enabled, this normally creates
    // a delete marker rather than permanently deleting versions.
    const s3Result = await deleteS3Object(document.s3_key);

    // 5. Soft-delete the database record.
    const updated = await pool.query(
      `UPDATE documents
       SET status = 'deleted',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND status = 'active'
       RETURNING id, status, updated_at`,
      [id]
    );

    if (updated.rows.length === 0) {
      console.error(
        "S3 deletion succeeded but document status update failed:",
        document.id
      );

      return res.status(409).json({
        success: false,
        message: "Document status could not be updated",
      });
    }

    // 6. Record audit event.
    await writeAuditLog(
      req,
      "DOCUMENT_DELETED",
      document.id,
      {
        original_name: document.original_name,
        case_id: document.case_id,
        uploaded_by: document.user_id,
        deleted_by: req.user.id,
        deleted_by_role: req.user.role,
        s3_delete_marker: s3Result.DeleteMarker ?? null,
        s3_version_id: s3Result.VersionId ?? null,
      }
    );

    // 7. Return success.
    return res.status(200).json({
      success: true,
      message: "Document deleted successfully",
      document: {
        id: updated.rows[0].id,
        status: updated.rows[0].status,
        updated_at: updated.rows[0].updated_at,
      },
    });

  } catch (error) {
    console.error("Delete document error:", {
      name: error.name,
      message: error.message,
      status: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
    });

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
  getCaseDocuments,
  requestDownload,
  deleteDocument,
};
