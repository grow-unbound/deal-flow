import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getHue(index: number): 'teal' | 'ember' | 'cream' {
  if (index % 3 === 0) return 'teal';
  if (index % 3 === 1) return 'ember';
  return 'cream';
}

async function resolveScopedPrice(
  db: any,
  tenantId: string,
  tenantProductId: string,
  buyerId: string | null,
  priceListId: string | null,
) {
  if (priceListId) {
    const { data: override } = await db
      .schema('app')
      .from('price_list_items')
      .select('price')
      .eq('price_list_id', priceListId)
      .eq('tenant_product_id', tenantProductId)
      .is('deleted_at', null)
      .order('min_qty', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (override?.price != null) {
      return Number(override.price);
    }
  }

  if (buyerId) {
    const { data } = await db.schema('app').rpc('resolve_price', {
      p_tenant_product_id: tenantProductId,
      p_buyer_id: buyerId,
      p_qty: 1,
    });
    if (typeof data === 'number' && Number.isFinite(data)) {
      return data;
    }
  }

  const { data: product } = await db
    .schema('app')
    .from('tenant_products')
    .select('base_selling_price')
    .eq('tenant_id', tenantId)
    .eq('id', tenantProductId)
    .maybeSingle();

  return Number(product?.base_selling_price ?? 0);
}

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, estimatesFlag, salesOrdersFlag, invoicesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
      getFlag(FEATURE_FLAGS.SALES_ORDERS, claims.tenant_id),
      getFlag(FEATURE_FLAGS.INVOICES, claims.tenant_id),
    ]);
    if (!orderMgmt || (!estimatesFlag && !salesOrdersFlag && !invoicesFlag)) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const tenantId = claims.tenant_id;
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
    const buyerId = request.nextUrl.searchParams.get('buyerId');
    const priceListId = request.nextUrl.searchParams.get('priceListId');
    const idsParam = request.nextUrl.searchParams.get('ids');
    const requestedIds = idsParam
      ? Array.from(new Set(idsParam.split(',').map((value) => value.trim()).filter(Boolean)))
      : [];
    const db = supabaseAdmin as any;

    const tenantProductsQuery = db
      .schema('app')
      .from('tenant_products')
      .select('id, internal_sku, name_override, base_selling_price, default_uom, pack_size, hsn_code, gst_rate, master_product_id, tenant_brand_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);

    const { data: tenantProducts, error: tenantProductsError } = requestedIds.length > 0
      ? await tenantProductsQuery.in('id', requestedIds)
      : await tenantProductsQuery.limit(60);

    if (tenantProductsError) {
      console.error('[GET /api/tenant/products/search] tenant_products error', tenantProductsError);
      return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
    }

    const productRows = (tenantProducts ?? []) as Array<{
      id: string;
      internal_sku: string;
      name_override: string | null;
      base_selling_price: number | null;
      default_uom: string | null;
      pack_size: number | null;
      hsn_code: string | null;
      gst_rate: number | null;
      master_product_id: string | null;
      tenant_brand_id: string | null;
    }>;

    const masterProductIds = Array.from(
      new Set(productRows.map((row) => row.master_product_id).filter((value): value is string => Boolean(value))),
    );
    const brandIds = Array.from(
      new Set(productRows.map((row) => row.tenant_brand_id).filter((value): value is string => Boolean(value))),
    );

    const [masterProductsRes, brandsRes, inventoryRes] = await Promise.all([
      masterProductIds.length > 0
        ? db.schema('catalog').from('products').select('id, name, master_sku, hsn_code, gst_rate, default_uom, pack_size').in('id', masterProductIds)
        : Promise.resolve({ data: [], error: null }),
      brandIds.length > 0
        ? db.schema('app').from('tenant_brands').select('id, display_name_override, master_brand_id').in('id', brandIds).eq('tenant_id', claims.tenant_id)
        : Promise.resolve({ data: [], error: null }),
      db
        .schema('app')
        .from('tenant_inventory')
        .select('tenant_product_id, qty_available')
        .in('tenant_product_id', productRows.map((row) => row.id)),
    ]);

    if (masterProductsRes.error || brandsRes.error || inventoryRes.error) {
      console.error('[GET /api/tenant/products/search] dependent query error', masterProductsRes.error || brandsRes.error || inventoryRes.error);
      return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
    }

    const masterProducts = (masterProductsRes.data ?? []) as Array<{
      id: string;
      name: string;
      master_sku: string;
      hsn_code: string | null;
      gst_rate: number | null;
      default_uom: string | null;
      pack_size: number | null;
    }>;
    const tenantBrands = (brandsRes.data ?? []) as Array<{
      id: string;
      display_name_override: string | null;
      master_brand_id: string | null;
    }>;
    const inventoryRows = (inventoryRes.data ?? []) as Array<{
      tenant_product_id: string;
      qty_available: number | null;
    }>;

    const masterBrandIds = Array.from(
      new Set(tenantBrands.map((row) => row.master_brand_id).filter((value): value is string => Boolean(value))),
    );
    const { data: masterBrands } =
      masterBrandIds.length > 0
        ? await db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds)
        : { data: [] as Array<{ id: string; name: string }> };

    const masterProductById = new Map(masterProducts.map((row) => [row.id, row]));
    const tenantBrandById = new Map(tenantBrands.map((row) => [row.id, row]));
    const masterBrandById = new Map(((masterBrands ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
    const onHandByProductId = new Map<string, number>();
    for (const row of inventoryRows) {
      onHandByProductId.set(row.tenant_product_id, (onHandByProductId.get(row.tenant_product_id) ?? 0) + Number(row.qty_available ?? 0));
    }

    const filtered = productRows
      .map((row, index) => {
        const master = row.master_product_id ? masterProductById.get(row.master_product_id) : undefined;
        const tenantBrand = row.tenant_brand_id ? tenantBrandById.get(row.tenant_brand_id) : undefined;
        const brandName =
          tenantBrand?.display_name_override?.trim()
          || (tenantBrand?.master_brand_id ? masterBrandById.get(tenantBrand.master_brand_id) : undefined)
          || 'Brand';
        const productName = row.name_override?.trim() || master?.name || row.internal_sku;
        return {
          tenant_product_id: row.id,
          product_name: productName,
          sku: row.internal_sku || master?.master_sku || '—',
          brand_name: brandName,
          brand_initials: getInitials(brandName),
          brand_hue: getHue(index),
          hsn_code: row.hsn_code ?? master?.hsn_code ?? null,
          tax_pct: Number(row.gst_rate ?? master?.gst_rate ?? 0),
          on_hand: onHandByProductId.get(row.id) ?? 0,
          unit_price: Number(row.base_selling_price ?? 0),
          default_uom: row.default_uom ?? master?.default_uom ?? null,
          pack_size: Number(row.pack_size ?? master?.pack_size ?? 0) || null,
        };
      })
      .filter((row) => {
        if (!q) return true;
        return `${row.product_name} ${row.sku} ${row.brand_name}`.toLowerCase().includes(q);
      })
      .slice(0, requestedIds.length > 0 ? requestedIds.length : 12);

    if (buyerId || priceListId) {
      await Promise.all(
        filtered.map(async (row) => {
          row.unit_price = await resolveScopedPrice(db, tenantId, row.tenant_product_id, buyerId, priceListId);
        }),
      );
    }

    return NextResponse.json({ products: filtered });
  } catch (error) {
    console.error('[GET /api/tenant/products/search]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
