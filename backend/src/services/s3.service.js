
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

// Verify uploaded object
const verifyUploadedObject = async (key) => {
  const result = await s3Client.send(
    new HeadObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );

  return result;
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
const deleteS3Object = async (key) => {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
};

module.exports = {
  generateUploadUrl,
  verifyUploadedObject,
  generateDownloadUrl,
  deleteS3Object,
};
