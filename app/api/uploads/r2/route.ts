import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';
import { z } from 'zod';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const UploadRequestSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  contentType: z.enum(ALLOWED_CONTENT_TYPES, {
    errorMap: () => ({ message: 'Only JPG, PNG, and WebP images are allowed.' }),
  }),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_SIZE_BYTES, 'Image must be under 5MB.'),
});

/** Sanitize filename to safe ASCII characters */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden — seller role required' }, { status: 403 });
    }

    // Parse + validate body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = UploadRequestSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? 'Invalid request';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { filename, contentType, sizeBytes: _sizeBytes } = parsed.data;
    const sanitized = sanitizeFilename(filename);
    const key = `uploads/${claims.tenant_id}/${Date.now()}-${sanitized}`;

    // Generate pre-signed URL
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    const publicUrl = getPublicUrl(key);

    return NextResponse.json({ uploadUrl, publicUrl, key }, { status: 200 });
  } catch (err) {
    console.error('[R2 presign]', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
