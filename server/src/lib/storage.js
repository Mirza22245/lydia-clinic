// Fillagring — ersätter Base44 UploadPrivateFile + CreateFileSignedUrl.
// Använder S3-kompatibel lagring (Hostinger Object Storage, AWS S3, MinIO).
// Genererar presigned URLs för säker nedladdning utan public exponering.
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "auto",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
  });
  return s3Client;
}

export async function uploadFile(file, key) {
  const client = getS3Client();
  const bucket = process.env.S3_BUCKET;
  const fileKey = key || `lydia/${Date.now()}-${file.originalname}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return { file_uri: `s3://${bucket}/${fileKey}` };
}

export async function createSignedUrl(fileUri, expiresIn = 300) {
  const client = getS3Client();
  const bucket = process.env.S3_BUCKET;
  // Extrahera key från s3://bucket/key
  const key = fileUri.replace(`s3://${bucket}/`, "");

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn }
  );

  return { signed_url: url };
}