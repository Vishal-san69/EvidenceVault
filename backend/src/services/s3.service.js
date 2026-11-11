
const {
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const {
  getSignedUrl,
} = require("@aws-sdk/s3-request-presigner");

const { s3Client } = require("../config/s3");

const BUCKET = process.env.AWS_S3_BUCKET;

// Generate secure upload URL
const generateUploadUrl = async ({
  key,
  contentType,
}) => {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: 300,
  });
};


const verifyUploadedObject = async (key) => {
  console.log("S3 verification started");
  console.log("Bucket:", BUCKET);
  console.log("Object key:", key);

  try {
    const result = await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );

    console.log("S3 object found");
    console.log("Content length:", result.ContentLength);
    console.log("Content type:", result.ContentType);
    console.log("Encryption:", result.ServerSideEncryption);

    return result;
  } catch (error) {
    console.error("S3 HeadObject failed:", error.name);
    console.error("AWS error:", error.message);
    console.error("HTTP status:", error.$metadata?.httpStatusCode);
    console.error("AWS request ID:", error.$metadata?.requestId);

    throw error;
  }
};

// Generate download URL
const generateDownloadUrl = async (key, originalName) => {
  const safeFilename = encodeURIComponent(originalName)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition:
      `attachment; filename*=UTF-8''${safeFilename}`,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: 300,
  });
};

// Delete S3 object
// Delete S3 object
const deleteS3Object = async (key) => {
  try {
    if (!key || typeof key !== "string") {
      throw new Error("Invalid S3 object key");
    }

    const result = await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );

    console.log("S3 deletion request accepted:", {
      bucket: BUCKET,
      key,
      deleteMarker: result.DeleteMarker ?? false,
      versionId: result.VersionId ?? null,
      requestId: result.$metadata?.requestId,
      httpStatus: result.$metadata?.httpStatusCode,
    });

    return result;

  } catch (error) {
    console.error("S3 deletion failed:", {
      name: error.name,
      message: error.message,
      status: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
    });

    throw error;
  }
};

module.exports = {
  generateUploadUrl,
  verifyUploadedObject,
  generateDownloadUrl,
  deleteS3Object,
};
