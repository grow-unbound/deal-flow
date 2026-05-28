import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_pricing_engine', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: priceList, error: plError } = await db
    .schema('app')
    .from('price_lists')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('is_active', true)
    .maybeSingle();

  if (plError) {
    console.error('[GET /api/price-lists/[id]] DB error:', plError.code, plError.message);
    return NextResponse.json(
      { error: 'Failed to fetch price list', code: plError.code, detail: plError.message },
      { status: 500 },
    );
  }

  if (!priceList) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  const { data: items, error: itemsError } = await db
    .schema('app')
    .from('price_list_items')
    .select(
      '*, tenant_product:tenant_products(id, internal_sku, name_override, mrp, base_selling_price, master_product:catalog.products(name))',
    )
    .eq('price_list_id', id)
    .order('min_qty', { ascending: true });

  if (itemsError) {
    console.error('[GET /api/price-lists/[id]] items error:', itemsError.code, itemsError.message);
    return NextResponse.json(
      { error: 'Failed to fetch items', code: itemsError.code, detail: itemsError.message },
      { status: 500 },
    );
  }

  const { data: assignments, error: assignmentsError } = await db
    .schema('app')
    .from('price_list_assignments')
    .select('*')
    .eq('price_list_id', id);

  if (assignmentsError) {
    console.error(
      '[GET /api/price-lists/[id]] assignments error:',
      assignmentsError.code,
      assignmentsError.message,
    );
    return NextResponse.json(
      {
        error: 'Failed to fetch assignments',
        code: assignmentsError.code,
        detail: assignmentsError.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    price_list: {
      ...priceList,
      items: items ?? [],
      assignments: assignments ?? [],
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden: seller_admin required' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_pricing_engine', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { is_active } = body as { is_active?: unknown };

  if (typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 });
  }

  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Verify price list belongs to tenant
  const { data: existing, error: fetchError } = await db
    .schema('app')
    .from('price_lists')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('is_active', true)
    .maybeSingle();

  if (fetchError) {
    console.error('[PATCH /api/price-lists/[id]] fetch error:', fetchError.code, fetchError.message);
    return NextResponse.json({ error: 'Failed to verify price list' }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  const { data: updated, error: updateError } = await db
    .schema('app')
    .from('price_lists')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .select('*')
    .single();

  if (updateError) {
    console.error('[PATCH /api/price-lists/[id]] update error:', updateError.code, updateError.message);
    return NextResponse.json(
      { error: 'Failed to update price list', code: updateError.code, detail: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ price_list: updated });
}
