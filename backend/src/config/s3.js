
const {
  S3Client,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");

const region = process.env.AWS_REGION || "ap-south-1";

const s3Client = new S3Client({ region });

const checkS3Connection = async () => {
  try {
    const bucket = process.env.AWS_S3_BUCKET;

    if (!bucket) {
      throw new Error("S3 configuration is missing");
    }

    await s3Client.send(
      new HeadBucketCommand({
        Bucket: bucket,
      })
    );

    console.log("EvidenceVault: AWS S3 connected successfully.");

    return true;
  } catch (error) {
    console.error("EvidenceVault: AWS S3 connection failed.");

    if (process.env.NODE_ENV !== "production") {
      console.error("Error:", error.message);
    }

    return false;
  }
};

module.exports = { s3Client, checkS3Connection };
