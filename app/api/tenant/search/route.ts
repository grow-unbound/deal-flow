import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';
import { searchScopedProducts } from '@/lib/server/scoped-product-search';
import { getSellerLocationScope } from '@/lib/server/seller-location-access';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export interface SearchItem {
  id: string;
  label: string;
  sublabel: string;
  url_path: string;
}

export interface SearchGroup {
  entity_type: string;
  items: SearchItem[];
}

export interface GlobalSearchResponse {
  groups: SearchGroup[];
  total: number;
}

function applyQuery<T extends { or: (filters: string) => T }>(query: T, q: string, filters: string[]) {
  if (!q) return query;
  return query.or(filters.map((filter) => `${filter}.ilike.%${q}%`).join(','));
}

function formatAmount(amount: number | null | undefined) {
  return `₹${Math.round(Number(amount ?? 0)).toLocaleString('en-IN')}`;
}

function cityFromAddress(address: unknown) {
  if (!address || typeof address !== 'object') return '';
  const city = (address as Record<string, unknown>).city;
  return typeof city === 'string' ? city.trim() : '';
}

export async function GET(req: NextRequest): Promise<NextResponse<GlobalSearchResponse | { error: string }>> {
  const claims = await getVerifiedClaims(req);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ groups: [], total: 0 }, { headers: SELLER_CACHE_REFERENCE });
  }

  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') ?? '5');
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 10)
    : 5;

  const db = supabaseAdmin as any;
  if (!db) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const locationScope = getSellerLocationScope({
    role: claims.role ?? null,
    location_ids: claims.location_ids ?? null,
  });
  const scopedLocationIds = locationScope.mode === 'subset' ? locationScope.locationIds : null;

  const scopedBuyerIdsPromise = scopedLocationIds && scopedLocationIds.length > 0
    ? db
        .schema('app')
        .from('metrics_buyer_location_snapshot')
        .select('buyer_id')
        .eq('tenant_id', claims.tenant_id)
        .in('location_id', scopedLocationIds)
        .is('deleted_at', null)
    : Promise.resolve({ data: null, error: null });

  const productsPromise = searchScopedProducts({
    db,
    tenantId: claims.tenant_id,
    query: q,
    limit,
    sort: 'relevance',
  });

  const [scopedBuyerIdsRes, productsRes] = await Promise.all([scopedBuyerIdsPromise, productsPromise]);
  if (scopedBuyerIdsRes.error) {
    return NextResponse.json({ error: 'Failed to scope customers' }, { status: 500 });
  }

  const scopedBuyerIds = scopedLocationIds
    ? Array.from(new Set(((scopedBuyerIdsRes.data ?? []) as Array<{ buyer_id: string | null }>).flatMap((row) => row.buyer_id ? [row.buyer_id] : [])))
    : null;

  const customersBase = db
    .schema('app')
    .from('buyers')
    .select('id, business_name, contact_name, phone, geography')
    .eq('tenant_id', claims.tenant_id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(limit);
  const customersQuery = applyQuery(customersBase, q, ['business_name', 'contact_name', 'external_ref', 'phone']);
  const customersPromise = scopedBuyerIds
    ? scopedBuyerIds.length > 0
      ? customersQuery.in('id', scopedBuyerIds)
      : Promise.resolve({ data: [], error: null })
    : customersQuery;

  const brandsPromise = applyQuery(
    db
      .schema('app')
      .from('tenant_brands')
      .select('id, display_name_override, description_override, description')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(limit),
    q,
    ['display_name_override', 'description_override', 'description'],
  );
  const categoriesPromise = applyQuery(
    db
      .schema('app')
      .from('tenant_categories')
      .select('id, name, description, is_active')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .limit(limit),
    q,
    ['name', 'description'],
  );
  const cohortsPromise = applyQuery(
    db
      .schema('app')
      .from('cohorts')
      .select('id, name, description')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .limit(limit),
    q,
    ['name', 'description'],
  );
  const campaignsPromise = applyQuery(
    db
      .schema('app')
      .from('campaigns')
      .select('id, name, status')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .limit(limit),
    q,
    ['name'],
  );
  const priceListsPromise = applyQuery(
    db
      .schema('app')
      .from('price_lists')
      .select('id, name, description, is_active')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .limit(limit),
    q,
    ['name', 'description'],
  );
  const ordersPromise = applyQuery(
    db
      .schema('app')
      .from('orders')
      .select('id, order_number, status, total_amount, buyer_id, location_id')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .limit(limit),
    q,
    ['order_number'],
  );
  const invoicesPromise = applyQuery(
    db
      .schema('app')
      .from('invoices')
      .select('id, invoice_number, status, total_amount, buyer_id, location_id')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .limit(limit),
    q,
    ['invoice_number'],
  );
  const estimatesPromise = applyQuery(
    db
      .schema('app')
      .from('estimates')
      .select('id, estimate_number, status, total_amount, buyer_id, location_id')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .limit(limit),
    q,
    ['estimate_number'],
  );
  const locationsPromise = applyQuery(
    db
      .schema('app')
      .from('locations')
      .select('id, name, address')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .limit(limit),
    q,
    ['name'],
  );
  const warehousesPromise = applyQuery(
    db
      .schema('app')
      .from('warehouses')
      .select('id, name, address, location_id')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .limit(limit),
    q,
    ['name'],
  );

  const [
    customersRes,
    brandsRes,
    categoriesRes,
    cohortsRes,
    campaignsRes,
    priceListsRes,
    ordersRes,
    invoicesRes,
    estimatesRes,
    locationsRes,
    warehousesRes,
  ] = await Promise.all([
    customersPromise,
    brandsPromise,
    categoriesPromise,
    cohortsPromise,
    campaignsPromise,
    priceListsPromise,
    scopedLocationIds ? ordersPromise.in('location_id', scopedLocationIds) : ordersPromise,
    scopedLocationIds ? invoicesPromise.in('location_id', scopedLocationIds) : invoicesPromise,
    scopedLocationIds ? estimatesPromise.in('location_id', scopedLocationIds) : estimatesPromise,
    scopedLocationIds ? locationsPromise.in('id', scopedLocationIds) : locationsPromise,
    scopedLocationIds ? warehousesPromise.in('location_id', scopedLocationIds) : warehousesPromise,
  ]);

  const firstError =
    customersRes.error
    ?? brandsRes.error
    ?? categoriesRes.error
    ?? cohortsRes.error
    ?? campaignsRes.error
    ?? priceListsRes.error
    ?? ordersRes.error
    ?? invoicesRes.error
    ?? estimatesRes.error
    ?? locationsRes.error
    ?? warehousesRes.error;
  if (firstError) {
    console.error('[search] direct search error:', firstError);
    return NextResponse.json({ groups: [], total: 0 }, { headers: SELLER_CACHE_REFERENCE });
  }

  const groups: SearchGroup[] = [];

  const productItems = productsRes.rows.map((row) => ({
    id: row.tenant_product_id,
    label: row.product_name,
    sublabel: [row.brand_name, row.category_name, row.sku].filter(Boolean).join(' · '),
    url_path: `/products/${row.tenant_product_id}`,
  }));
  if (productItems.length > 0) groups.push({ entity_type: 'product', items: productItems });

  const brandItems = ((brandsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.display_name_override ?? 'Brand'),
    sublabel: String(row.description_override ?? row.description ?? ''),
    url_path: `/brands/${row.id}`,
  }));
  if (brandItems.length > 0) groups.push({ entity_type: 'brand', items: brandItems });

  const categoryItems = ((categoriesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.name ?? 'Category'),
    sublabel: String(row.description ?? ((row.is_active ?? true) ? 'Active' : 'Inactive')),
    url_path: `/categories/${row.id}`,
  }));
  if (categoryItems.length > 0) groups.push({ entity_type: 'category', items: categoryItems });

  const customerItems = ((customersRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.business_name ?? 'Customer'),
    sublabel: [row.contact_name, (row.geography as Record<string, unknown> | null)?.city, row.phone].filter(Boolean).join(' · '),
    url_path: `/customers/${row.id}`,
  }));
  if (customerItems.length > 0) groups.push({ entity_type: 'customer', items: customerItems });

  const cohortItems = ((cohortsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.name ?? 'Customer group'),
    sublabel: String(row.description ?? 'Active'),
    url_path: `/customer-groups/${row.id}`,
  }));
  if (cohortItems.length > 0) groups.push({ entity_type: 'cohort', items: cohortItems });

  const campaignItems = ((campaignsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.name ?? 'Campaign'),
    sublabel: String(row.status ?? ''),
    url_path: `/campaigns/${row.id}`,
  }));
  if (campaignItems.length > 0) groups.push({ entity_type: 'campaign', items: campaignItems });

  const priceListItems = ((priceListsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.name ?? 'Price list'),
    sublabel: String(row.description ?? ((row.is_active ?? true) ? 'Active' : 'Inactive')),
    url_path: `/price-lists/${row.id}`,
  }));
  if (priceListItems.length > 0) groups.push({ entity_type: 'price_list', items: priceListItems });

  const orderItems = ((ordersRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.order_number ?? 'Order'),
    sublabel: `${row.status ?? ''} · ${formatAmount(Number(row.total_amount ?? 0))}`,
    url_path: `/sales-orders/${row.id}`,
  }));
  if (orderItems.length > 0) groups.push({ entity_type: 'order', items: orderItems });

  const invoiceItems = ((invoicesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.invoice_number ?? 'Invoice'),
    sublabel: `${row.status ?? ''} · ${formatAmount(Number(row.total_amount ?? 0))}`,
    url_path: `/invoices/${row.id}`,
  }));
  if (invoiceItems.length > 0) groups.push({ entity_type: 'invoice', items: invoiceItems });

  const estimateItems = ((estimatesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.estimate_number ?? 'Estimate'),
    sublabel: `${row.status ?? ''} · ${formatAmount(Number(row.total_amount ?? 0))}`,
    url_path: `/estimates/${row.id}`,
  }));
  if (estimateItems.length > 0) groups.push({ entity_type: 'estimate', items: estimateItems });

  const locationItems = ((locationsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.name ?? 'Location'),
    sublabel: cityFromAddress(row.address),
    url_path: `/locations/${row.id}/detail`,
  }));
  if (locationItems.length > 0) groups.push({ entity_type: 'location', items: locationItems });

  const warehouseItems = ((warehousesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.name ?? 'Warehouse'),
    sublabel: cityFromAddress(row.address),
    url_path: `/warehouses/${row.id}`,
  }));
  if (warehouseItems.length > 0) groups.push({ entity_type: 'warehouse', items: warehouseItems });

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return NextResponse.json({ groups, total }, { headers: SELLER_CACHE_REFERENCE });
}
