import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { createProductQueryEmbedding } from '@/lib/server/product-search';
import { supabaseAdmin } from '@/lib/supabase';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseOptionsLimit, SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';

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
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    const buyerId = request.nextUrl.searchParams.get('buyerId') ?? null;
    const priceListId = request.nextUrl.searchParams.get('priceListId') ?? null;
    const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10);
    const requestedLimit = parseOptionsLimit(
      Number.isFinite(limitParam) && limitParam > 0 ? String(limitParam) : null,
      PAGE_SIZE.SEARCH,
    );
    const idsParam = request.nextUrl.searchParams.get('ids');
    const requestedIds = idsParam
      ? Array.from(new Set(idsParam.split(',').map((value) => value.trim()).filter(Boolean)))
      : [];

    const db = supabaseAdmin as any;
    const queryEmbedding = q ? await createProductQueryEmbedding(q) : null;

    const { data, error } = await db.schema('app').rpc('search_products', {
      p_tenant_id: tenantId,
      p_query: q,
      p_buyer_id: buyerId,
      p_price_list_id: priceListId,
      p_limit: requestedIds.length > 0 ? requestedIds.length : requestedLimit + 1,
      p_query_embedding: queryEmbedding,
      p_ids: requestedIds.length > 0 ? requestedIds : null,
    });

    if (error) {
      console.error('[GET /api/tenant/products/search] search_products RPC error', error);
      return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{
      tenant_product_id: string;
      product_name: string;
      sku: string | null;
      brand_name: string;
      category_name: string;
      hsn_code: string | null;
      tax_pct: number | null;
      on_hand: number | null;
      unit_price: number | null;
      mrp: number | null;
      base_selling_price: number | null;
      default_uom: string | null;
      pack_size: number | null;
    }>;

    const orderedRows = requestedIds.length > 0
      ? requestedIds
          .map((id) => rows.find((row) => row.tenant_product_id === id))
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
      : rows.slice(0, requestedLimit);

    const hasMore = requestedIds.length > 0 ? false : rows.length > requestedLimit;

    const products = orderedRows.map((row, index) => {
      const brandName = row.brand_name || 'Brand';
      return {
        tenant_product_id: row.tenant_product_id,
        product_name: row.product_name,
        sku: row.sku || '—',
        brand_name: brandName,
        brand_initials: getInitials(brandName),
        brand_hue: getHue(index),
        hsn_code: row.hsn_code ?? null,
        tax_pct: row.tax_pct ?? null,
        on_hand: Number(row.on_hand ?? 0),
        unit_price: Number(row.unit_price ?? 0),
        mrp: Number(row.mrp ?? 0),
        base_selling_price: Number(row.base_selling_price ?? 0),
        default_uom: row.default_uom ?? null,
        pack_size: row.pack_size ?? null,
      };
    });

    return NextResponse.json({ products, has_more: hasMore }, { headers: SELLER_CACHE_REFERENCE });
  } catch (error) {
    console.error('[GET /api/tenant/products/search]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
