import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { searchScopedProducts } from '@/lib/server/scoped-product-search';
import { supabaseAdmin } from '@/lib/supabase';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseOptionsLimit, SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';

const RequestedIdsSchema = z.array(z.string().uuid()).max(PAGE_SIZE.MAX);

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
    const requestedIdsResult = RequestedIdsSchema.safeParse(idsParam
      ? Array.from(new Set(idsParam.split(',').map((value) => value.trim()).filter(Boolean)))
      : []);
    if (!requestedIdsResult.success) {
      return NextResponse.json({ error: 'Invalid product ids' }, { status: 400 });
    }
    const requestedIds = requestedIdsResult.data;

    const { rows } = await searchScopedProducts({
      db: supabaseAdmin as any,
      tenantId,
      query: q,
      buyerId,
      priceListId,
      limit: requestedIds.length > 0 ? requestedIds.length : requestedLimit + 1,
      ids: requestedIds.length > 0 ? requestedIds : null,
    });

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
