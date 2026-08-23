import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME ?? 'yukti-assets';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client, command, { expiresIn: 3600 });
}

export async function putObjectJson(key: string, value: unknown): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: JSON.stringify(value),
    ContentType: 'application/json',
  });
  await r2Client.send(command);
}

export function getPublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Presigned PUT URLs (unlike presigned POST policies) can't carry a
 * Content-Length-Range condition, so max-size enforcement happens here instead —
 * one HeadObjectCommand per finalized variant key, called from the shared
 * finalize-payload parser (image-upload.ts) right after the client claims the
 * upload is done. Oversized objects are deleted before any DB row references
 * them. Returns null if the object doesn't exist (finalize will fail downstream
 * with its own "not found"-style error anyway).
 */
export async function getObjectSize(key: string): Promise<number | null> {
  try {
    const res = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return res.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key });
  await r2Client.send(command);
}

export function extractKeyFromUrl(url: string): string {
  return url.replace(`${R2_PUBLIC_URL}/`, '');
}
