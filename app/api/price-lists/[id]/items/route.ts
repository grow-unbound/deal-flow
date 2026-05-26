import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { PriceListItemCreateSchema } from '@/lib/zod';

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

  // Verify the price list belongs to this tenant
  const { data: pl } = await db
    .schema('app')
    .from('price_lists')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('is_active', true)
    .maybeSingle();

  if (!pl) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  const { data: items, error } = await db
    .schema('app')
    .from('price_list_items')
    .select(
      '*, tenant_product:tenant_products(id, internal_sku, name_override, mrp, base_selling_price, master_product:catalog.products(name))',
    )
    .eq('price_list_id', id)
    .order('min_qty', { ascending: true });

  if (error) {
    console.error('[GET /api/price-lists/[id]/items] DB error:', error.code, error.message);
    return NextResponse.json(
      { error: 'Failed to fetch items', code: error.code, detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ items: items ?? [] });
}

export async function POST(
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

  const pricingEnabled = await getFlag('df_pricing_engine', claims.tenant_id);
  if (!pricingEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  const productMasterEnabled = await getFlag('df_brand_product_master', claims.tenant_id);
  if (!productMasterEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PriceListItemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Verify the price list belongs to this tenant
  const { data: pl } = await db
    .schema('app')
    .from('price_lists')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('is_active', true)
    .maybeSingle();

  if (!pl) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  // Verify the tenant_product belongs to this tenant
  const { data: product } = await db
    .schema('app')
    .from('tenant_products')
    .select('id')
    .eq('id', data.tenant_product_id)
    .eq('tenant_id', claims.tenant_id)
    .is('is_active', true)
    .maybeSingle();

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const { data: item, error: insertError } = await db
    .schema('app')
    .from('price_list_items')
    .insert({
      price_list_id: id,
      tenant_product_id: data.tenant_product_id,
      price: data.price,
      min_qty: data.min_qty,
      max_qty: data.max_qty ?? null,
    })
    .select()
    .single();

  if (insertError) {
    // Unique constraint: (price_list_id, tenant_product_id, min_qty)
    if (insertError.code === '23505') {
      return NextResponse.json(
        {
          error:
            'A price entry already exists for this product at that minimum quantity.',
        },
        { status: 409 },
      );
    }
    console.error(
      '[POST /api/price-lists/[id]/items] DB error:',
      insertError.code,
      insertError.message,
    );
    return NextResponse.json(
      { error: 'Failed to add item', code: insertError.code, detail: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ item }, { status: 201 });
}
