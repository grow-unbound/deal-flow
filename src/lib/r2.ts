import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2_UPLOAD_CACHE_CONTROL } from '@/lib/r2-cache-control';

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
    CacheControl: R2_UPLOAD_CACHE_CONTROL,
  });
  return getSignedUrl(r2Client, command, { expiresIn: 3600 });
}

/**
 * Short-lived presigned GET URL for reading a private object back out of R2 —
 * the read-side counterpart to getPresignedUploadUrl. Used for seller-facing
 * document preview/download (Task 12 of the buyer-approval signup flow):
 * callers must re-request a fresh URL right before use rather than caching
 * one, since it expires quickly (default 5 minutes).
 */
export async function getPresignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
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

/**
 * Server-side copy within the same bucket — no download/re-upload round trip.
 * Used by cross-tenant document reuse (buyer-documents reuse-confirm route):
 * each tenant's buyer_documents row must own an independent object per the
 * "copy, not link" decision, so this mints a brand-new key rather than
 * pointing two rows at one storage_key.
 */
export async function copyObject(sourceKey: string, destinationKey: string): Promise<void> {
  const command = new CopyObjectCommand({
    Bucket: R2_BUCKET,
    CopySource: `${R2_BUCKET}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
    Key: destinationKey,
  });
  await r2Client.send(command);
}

export function extractKeyFromUrl(url: string): string {
  return url.replace(`${R2_PUBLIC_URL}/`, '');
}
