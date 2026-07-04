import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
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

    const internalSku = req.nextUrl.searchParams.get('internal_sku')?.trim() ?? '';
    const excludeId = req.nextUrl.searchParams.get('exclude_id')?.trim() || null;

    if (!internalSku) {
      return NextResponse.json({ available: true, duplicate: false, product: null });
    }

    const db = supabaseAdmin as any;
    let query = db
      .schema('app')
      .from('tenant_products')
      .select('id, internal_sku, name_override, master_product_id')
      .eq('tenant_id', claims.tenant_id)
      .eq('internal_sku', internalSku)
      .is('deleted_at', null)
      .limit(1);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Failed to check SKU availability' }, { status: 500 });
    }

    const duplicate = Boolean(data);
    return NextResponse.json({
      available: !duplicate,
      duplicate,
      product: data ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
