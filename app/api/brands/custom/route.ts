import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { createTenantBrand } from '@/lib/server/tenant-brand-create';

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const body = await req.json();
    const created = await createTenantBrand(db, claims, {
      ...body,
      mode: 'custom',
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && 'error' in err) {
      const typedErr = err as { status: number; error: string; details?: unknown };
      return NextResponse.json(
        typedErr.details ? { error: typedErr.error, details: typedErr.details } : { error: typedErr.error },
        { status: typedErr.status },
      );
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
