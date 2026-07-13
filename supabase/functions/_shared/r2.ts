import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${Deno.env.get('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
  },
});

const R2_BUCKET = Deno.env.get('R2_BUCKET_NAME') ?? 'yukti-assets';

export async function putObjectJson(key: string, value: unknown): Promise<void> {
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: JSON.stringify(value),
    ContentType: 'application/json',
  }));
}
