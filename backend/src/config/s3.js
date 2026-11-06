
const {
  S3Client,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
});

const checkS3Connection = async () => {
  try {
    const bucket = process.env.AWS_S3_BUCKET;

    // Check required configuration
    if (!bucket) {
      throw new Error("AWS_S3_BUCKET is missing from backend environment");
    }

    if (!process.env.AWS_REGION) {
      console.warn("AWS_REGION is not configured. Using ap-south-1.");
    }

    await s3Client.send(
      new HeadBucketCommand({
        Bucket: bucket,
      })
    );

    console.log("EvidenceVault AWS S3 connection successful");
    console.log("S3 region:", process.env.AWS_REGION || "ap-south-1");
    console.log("S3 bucket:", bucket);

    return true;

  } catch (error) {
    console.error("\n========== AWS S3 CONNECTION ERROR ==========");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("AWS error code:", error.Code || error.code || "Not provided");
    console.error(
      "HTTP status:",
      error.$metadata?.httpStatusCode || "Not available"
    );
    console.error(
      "AWS request ID:",
      error.$metadata?.requestId || "Not available"
    );

    if (error.cause) {
      console.error("Underlying cause:", error.cause.message || error.cause);
    }

    console.error("==============================================\n");

    return false;
  }
};

module.exports = {
  s3Client,
  checkS3Connection,
};
