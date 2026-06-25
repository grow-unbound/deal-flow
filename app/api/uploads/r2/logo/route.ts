import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';
import { z } from 'zod';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const LogoUploadRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.enum(ALLOWED_CONTENT_TYPES, {
    errorMap: () => ({ message: 'Only JPG, PNG, and WebP images are allowed.' }),
  }),
  sizeBytes: z.number().int().max(5 * 1024 * 1024, 'File must be under 5 MB'),
});

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);
    if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = LogoUploadRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }

    const { contentType } = parsed.data;
    const ext = MIME_TO_EXT[contentType] ?? 'jpg';
    const key = `tenants/${claims.tenant_id}/logo/logo.${ext}`;

    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    const publicUrl = getPublicUrl(key);

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (err) {
    console.error('[R2 logo presign]', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
