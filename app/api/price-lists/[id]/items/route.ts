import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
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
    .is('deleted_at', null)
    .maybeSingle();

  if (!pl) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  const { data: items, error } = await db
    .schema('app')
    .from('price_list_items')
    .select(
      '*, tenant_product:tenant_products(id, internal_sku, name_override, mrp, base_selling_price, cost_price, is_active, master_product_id, tenant_brand:tenant_brands(id, display_name_override, master_brand_id))',
    )
    .eq('price_list_id', id)
    .is('deleted_at', null)
    .order('min_qty', { ascending: true });

  if (error) {
    console.error('[GET /api/price-lists/[id]/items] DB error:', error.code, error.message);
    return NextResponse.json(
      { error: 'Failed to fetch items', code: error.code, detail: error.message },
      { status: 500 },
    );
  }

  const rows = items ?? [];
  const masterProductIds = Array.from(
    new Set(
      rows
        .map((item: { tenant_product?: { master_product_id?: string | null } | null }) => item.tenant_product?.master_product_id)
        .filter(Boolean) as string[],
    ),
  );
  const masterBrandIds = Array.from(
    new Set(
      rows
        .map(
          (item: {
            tenant_product?: {
              tenant_brand?: { master_brand_id?: string | null } | null;
            } | null;
          }) => item.tenant_product?.tenant_brand?.master_brand_id,
        )
        .filter(Boolean) as string[],
    ),
  );

  const [masterProductsRes, masterBrandsRes] = await Promise.all([
    masterProductIds.length > 0
      ? db.schema('catalog').from('products').select('id, name').in('id', masterProductIds)
      : Promise.resolve({ data: [], error: null }),
    masterBrandIds.length > 0
      ? db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (masterProductsRes.error || masterBrandsRes.error) {
    console.error(
      '[GET /api/price-lists/[id]/items] catalog denorm error:',
      masterProductsRes.error || masterBrandsRes.error,
    );
    return NextResponse.json({ error: 'Failed to fetch item details' }, { status: 500 });
  }

  const masterProductNameMap = new Map(
    (masterProductsRes.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]),
  );
  const masterBrandNameMap = new Map(
    (masterBrandsRes.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]),
  );

  const enrichedItems = rows.map(
    (item: {
      tenant_product?: {
        id: string;
        internal_sku: string;
        name_override: string | null;
        mrp: number | null;
        base_selling_price: number | null;
        cost_price: number | null;
        is_active?: boolean;
        master_product_id?: string | null;
        tenant_brand?: {
          id: string;
          display_name_override: string | null;
          master_brand_id?: string | null;
        } | null;
      } | null;
    }) => ({
      ...item,
      tenant_product: item.tenant_product
        ? {
            ...item.tenant_product,
            cost_price: claims.role === 'seller_admin' ? item.tenant_product.cost_price ?? null : null,
            tenant_brand: item.tenant_product.tenant_brand
              ? {
                  id: item.tenant_product.tenant_brand.id,
                  display_name_override: item.tenant_product.tenant_brand.display_name_override,
                  master_brand: item.tenant_product.tenant_brand.master_brand_id
                    ? { name: masterBrandNameMap.get(item.tenant_product.tenant_brand.master_brand_id) ?? 'Unknown brand' }
                    : null,
                }
              : null,
            master_product: item.tenant_product.master_product_id
              ? { name: masterProductNameMap.get(item.tenant_product.master_product_id) ?? 'Unknown product' }
              : null,
          }
        : null,
    }),
  );

  return NextResponse.json({ items: enrichedItems }, { headers: SELLER_CACHE_PERSONAL });
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
    .select('id, external_ref')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!pl) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  // Externally-sourced (Zoho) price lists: membership/pricing come from the sync only.
  if (pl.external_ref) {
    return NextResponse.json(
      { error: 'This price list is managed by your Zoho integration. Products and prices sync automatically — edit them in Zoho.' },
      { status: 409 },
    );
  }

  // Verify the tenant_product belongs to this tenant
  const { data: product } = await db
    .schema('app')
    .from('tenant_products')
    .select('id')
    .eq('id', data.tenant_product_id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
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
      created_by: claims.sub,
      updated_by: claims.sub,
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

  await db.schema('app').from('audit_log').insert({
    tenant_id: claims.tenant_id,
    actor_user_id: claims.sub,
    entity_type: 'price_list',
    entity_id: id,
    action: 'create',
    diff: { event: 'item_added', item_id: item.id },
    ts: new Date().toISOString(),
  });

  return NextResponse.json({ item }, { status: 201 });
}
