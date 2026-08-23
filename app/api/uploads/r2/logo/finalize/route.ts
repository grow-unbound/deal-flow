import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { deleteObject, getObjectSize } from '@/lib/r2';
import { z } from 'zod';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const FinalizeRequestSchema = z.object({
  key: z.string().min(1),
});

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

    const parsed = FinalizeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }

    const { key } = parsed.data;
    if (!key.startsWith(`tenants/${claims.tenant_id}/logo/`)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const size = await getObjectSize(key);
    if (size === null || size > MAX_LOGO_BYTES) {
      await deleteObject(key);
      return NextResponse.json({ error: 'Logo image must be under 5 MB.' }, { status: 413 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[R2 logo finalize]', err);
    return NextResponse.json({ error: 'Failed to verify uploaded logo.' }, { status: 500 });
  }
}
