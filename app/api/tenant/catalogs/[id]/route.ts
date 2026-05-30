import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getPostHogClient } from '@/lib/posthog-server';

type DbClient = NonNullable<typeof supabaseAdmin>;

type CatalogStatus = 'draft' | 'published' | 'archived';

type ScopeType = 'cohort' | 'buyer' | 'geography' | 'all';

const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('extend_validity'),
    valid_until: z.string().datetime(),
  }),
  z.object({
    action: z.literal('add_product'),
    tenant_product_id: z.string().uuid(),
    price_override: z.number().nonnegative().nullable().optional(),
  }),
  z.object({
    action: z.literal('remove_product'),
    tenant_product_id: z.string().uuid(),
  }),
]);

function getDisplayStatus(status: CatalogStatus, validTo: string | null): { label: 'Live' | 'Draft' | 'Ended'; tone: 'success' | 'warning' | 'neutral' } {
  if (status === 'draft') return { label: 'Draft', tone: 'warning' };
  if (status === 'archived') return { label: 'Ended', tone: 'neutral' };
  if (validTo && new Date(validTo).getTime() < Date.now()) return { label: 'Ended', tone: 'neutral' };
  return { label: 'Live', tone: 'success' };
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(date: string | null): string {
  if (!date) return 'No end date';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dayKey(input: string): string {
  return new Date(input).toISOString().slice(0, 10);
}

async function fetchPosthogCatalogFunnel(catalogId: string): Promise<{ uniqueViewers: number; cartAdds: number; viewedBuyerIds: string[] }> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const token = process.env.POSTHOG_PERSONAL_API_KEY;

  if (!projectId || !token) {
    return { uniqueViewers: 0, cartAdds: 0, viewedBuyerIds: [] };
  }

  try {
    const posthog = getPostHogClient();

    const uniqueViewers = await posthog.query({
      kind: 'HogQLQuery',
      query: `
        SELECT count(DISTINCT properties.buyer_id)
        FROM events
        WHERE event = 'catalog_viewed'
          AND properties.catalog_id = {catalog_id:String}
          AND properties.buyer_id IS NOT NULL
      `,
      values: { catalog_id: catalogId },
    } as Record<string, unknown>);

    const cartAdds = await posthog.query({
      kind: 'HogQLQuery',
      query: `
        SELECT count(*)
        FROM events
        WHERE event = 'catalog_item_added_to_cart'
          AND properties.catalog_id = {catalog_id:String}
      `,
      values: { catalog_id: catalogId },
    } as Record<string, unknown>);

    const viewedBuyers = await posthog.query({
      kind: 'HogQLQuery',
      query: `
        SELECT DISTINCT properties.buyer_id
        FROM events
        WHERE event = 'catalog_viewed'
          AND properties.catalog_id = {catalog_id:String}
          AND properties.buyer_id IS NOT NULL
      `,
      values: { catalog_id: catalogId },
    } as Record<string, unknown>);

    const uniqueViewersCount = Number((uniqueViewers as { results?: Array<{ [k: string]: unknown }> })?.results?.[0]?.[0] ?? 0);
    const cartAddsCount = Number((cartAdds as { results?: Array<{ [k: string]: unknown }> })?.results?.[0]?.[0] ?? 0);
    const viewedBuyerIds = ((viewedBuyers as { results?: Array<{ [k: string]: unknown }> })?.results ?? [])
      .map((row) => String(row[0] ?? ''))
      .filter(Boolean);

    return { uniqueViewers: uniqueViewersCount, cartAdds: cartAddsCount, viewedBuyerIds };
  } catch {
    return { uniqueViewers: 0, cartAdds: 0, viewedBuyerIds: [] };
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as DbClient;

  const { data: globalCatalog, error: globalCatalogError } = await db
    .schema('app')
    .from('published_catalogs')
    .select('id, tenant_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (globalCatalogError) return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
  if (!globalCatalog) return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });
  if (globalCatalog.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [catalogRes, itemsRes, ordersRes] = await Promise.all([
    db
      .schema('app')
      .from('published_catalogs')
      .select('id, tenant_id, name, scope_type, scope_value, valid_from, valid_to, status, share_token, created_by, created_at')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .single(),
    db
      .schema('app')
      .from('published_catalog_items')
      .select('id, tenant_product_id, price_override, display_order, created_at')
      .eq('catalog_id', id)
      .is('deleted_at', null)
      .order('display_order', { ascending: true }),
    db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, total_amount, placed_at, status')
      .eq('tenant_id', claims.tenant_id)
      .eq('catalog_id', id)
      .is('deleted_at', null),
  ]);

  if (catalogRes.error) return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });
  if (itemsRes.error || ordersRes.error) return NextResponse.json({ error: 'Failed to load catalog detail' }, { status: 500 });

  const catalog = catalogRes.data as {
    id: string;
    tenant_id: string;
    name: string;
    scope_type: ScopeType;
    scope_value: Record<string, unknown> | null;
    valid_from: string;
    valid_to: string | null;
    status: CatalogStatus;
    share_token: string | null;
    created_by: string | null;
    created_at: string;
  };

  const catalogItems = (itemsRes.data ?? []) as Array<{
    id: string;
    tenant_product_id: string;
    price_override: number | null;
    display_order: number | null;
    created_at: string;
  }>;

  const orders = (ordersRes.data ?? []) as Array<{
    id: string;
    buyer_id: string;
    total_amount: number | null;
    placed_at: string | null;
    status: string;
  }>;

  const tenantProductIds = catalogItems.map((item) => item.tenant_product_id);

  const [productsRes, inventoryRes] = await Promise.all([
    tenantProductIds.length
      ? db
          .schema('app')
          .from('tenant_products')
          .select('id, internal_sku, name_override, tenant_brand_id, mrp, base_selling_price')
          .in('id', tenantProductIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    tenantProductIds.length
      ? db
          .schema('app')
          .from('tenant_inventory')
          .select('tenant_product_id, qty_available, reorder_point')
          .in('tenant_product_id', tenantProductIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsRes.error || inventoryRes.error) {
    return NextResponse.json({ error: 'Failed to load catalog products' }, { status: 500 });
  }

  const tenantProducts = (productsRes.data ?? []) as Array<{
    id: string;
    internal_sku: string;
    name_override: string | null;
    tenant_brand_id: string | null;
    mrp: number | null;
    base_selling_price: number | null;
  }>;

  const tenantBrandIds = Array.from(new Set(tenantProducts.map((p) => p.tenant_brand_id).filter(Boolean))) as string[];

  const tenantBrandsRes = tenantBrandIds.length
    ? await db
        .schema('app')
        .from('tenant_brands')
        .select('id, display_name_override, master_brand_id')
        .in('id', tenantBrandIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  if (tenantBrandsRes.error) return NextResponse.json({ error: 'Failed to load brand metadata' }, { status: 500 });

  const tenantBrands = (tenantBrandsRes.data ?? []) as Array<{ id: string; display_name_override: string | null; master_brand_id: string }>;

  const masterBrandIds = Array.from(new Set(tenantBrands.map((b) => b.master_brand_id)));
  const masterBrandsRes = masterBrandIds.length
    ? await db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds).is('deleted_at', null)
    : { data: [], error: null };

  if (masterBrandsRes.error) return NextResponse.json({ error: 'Failed to load master brands' }, { status: 500 });

  const masterBrandById = new Map(((masterBrandsRes.data ?? []) as Array<{ id: string; name: string }>).map((brand) => [brand.id, brand.name]));
  const tenantBrandById = new Map(tenantBrands.map((brand) => [brand.id, brand]));

  const inventoryByProductId = new Map(((inventoryRes.data ?? []) as Array<{ tenant_product_id: string; qty_available: number | null; reorder_point: number | null }>).map((inv) => [inv.tenant_product_id, inv]));

  const scopeValue = (catalog.scope_value ?? {}) as { cohort_id?: string; buyer_id?: string };

  let cohortMembers: Array<{ buyer_id: string }> = [];
  let cohortName = 'All buyers';

  if (catalog.scope_type === 'cohort' && scopeValue.cohort_id) {
    const [membersRes, cohortRes] = await Promise.all([
      db.schema('app').from('cohort_members').select('buyer_id').eq('cohort_id', scopeValue.cohort_id).is('deleted_at', null),
      db.schema('app').from('cohorts').select('name').eq('id', scopeValue.cohort_id).maybeSingle(),
    ]);

    if (!membersRes.error) cohortMembers = (membersRes.data ?? []) as Array<{ buyer_id: string }>;
    if (!cohortRes.error && cohortRes.data?.name) cohortName = cohortRes.data.name;
  } else if (catalog.scope_type === 'buyer' && scopeValue.buyer_id) {
    cohortMembers = [{ buyer_id: scopeValue.buyer_id }];
    const buyerRes = await db.schema('app').from('buyers').select('business_name').eq('id', scopeValue.buyer_id).maybeSingle();
    if (!buyerRes.error && buyerRes.data?.business_name) cohortName = buyerRes.data.business_name;
  } else {
    const allBuyersRes = await db
      .schema('app')
      .from('buyers')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null);
    if (!allBuyersRes.error) cohortMembers = ((allBuyersRes.data ?? []) as Array<{ id: string }>).map((buyer) => ({ buyer_id: buyer.id }));
    cohortName = catalog.scope_type === 'all' ? 'All buyers' : 'Targeted';
  }

  const cohortMemberIds = Array.from(new Set(cohortMembers.map((member) => member.buyer_id)));
  const buyersRes = cohortMemberIds.length
    ? await db
        .schema('app')
        .from('buyers')
        .select('id, business_name')
        .in('id', cohortMemberIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  if (buyersRes.error) return NextResponse.json({ error: 'Failed to load buyers' }, { status: 500 });

  const buyersById = new Map(((buyersRes.data ?? []) as Array<{ id: string; business_name: string }>).map((buyer) => [buyer.id, buyer]));

  const productById = new Map(tenantProducts.map((product) => [product.id, product]));
  const composition = catalogItems.map((item) => {
    const product = productById.get(item.tenant_product_id);
    const tenantBrand = product?.tenant_brand_id ? tenantBrandById.get(product.tenant_brand_id) : null;
    const brandName = tenantBrand
      ? tenantBrand.display_name_override ?? masterBrandById.get(tenantBrand.master_brand_id) ?? 'Unknown brand'
      : 'Unknown brand';
    const inv = inventoryByProductId.get(item.tenant_product_id);
    const qty = Number(inv?.qty_available ?? 0);
    const reorder = Number(inv?.reorder_point ?? 0);
    const stockStatus = qty <= 0 ? 'Out of stock' : reorder > 0 && qty <= reorder ? 'Low stock' : 'In stock';

    return {
      tenant_product_id: item.tenant_product_id,
      product: product?.name_override ?? product?.internal_sku ?? 'Unknown product',
      brand: brandName,
      mrp: Number(product?.mrp ?? 0),
      catalog_price: Number(product?.base_selling_price ?? 0),
      override_price: item.price_override != null ? Number(item.price_override) : null,
      stock_status: stockStatus,
    };
  });

  const brandsCovered = new Set(composition.map((item) => item.brand)).size;

  const validOrders = orders.filter((order) => order.status !== 'cancelled');
  const totalOrders = validOrders.length;
  const gmv = validOrders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);

  const previousCatalogRes = await db
    .schema('app')
    .from('published_catalogs')
    .select('id, created_at')
    .eq('tenant_id', claims.tenant_id)
    .neq('id', id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .lt('created_at', catalog.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let previousGmv = 0;
  if (!previousCatalogRes.error && previousCatalogRes.data?.id) {
    const prevOrdersRes = await db
      .schema('app')
      .from('orders')
      .select('total_amount, status')
      .eq('tenant_id', claims.tenant_id)
      .eq('catalog_id', previousCatalogRes.data.id)
      .is('deleted_at', null);
    if (!prevOrdersRes.error) {
      previousGmv = ((prevOrdersRes.data ?? []) as Array<{ total_amount: number | null; status: string }>)
        .filter((order) => order.status !== 'cancelled')
        .reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
    }
  }

  const growthPct = previousGmv > 0 ? Number((((gmv - previousGmv) / previousGmv) * 100).toFixed(1)) : gmv > 0 ? 100 : 0;

  const { uniqueViewers, cartAdds, viewedBuyerIds } = await fetchPosthogCatalogFunnel(id);

  const conversionRate = uniqueViewers > 0 ? Number(((totalOrders / uniqueViewers) * 100).toFixed(1)) : 0;

  const today = Date.now();
  const daysLeft = catalog.valid_to ? Math.max(0, Math.ceil((new Date(catalog.valid_to).getTime() - today) / (1000 * 60 * 60 * 24))) : 0;

  const dailyRollup = new Map<string, { revenue: number; orders: number }>();

  for (const order of validOrders) {
    if (!order.placed_at) continue;
    const key = dayKey(order.placed_at);
    const current = dailyRollup.get(key) ?? { revenue: 0, orders: 0 };
    current.revenue += Number(order.total_amount ?? 0);
    current.orders += 1;
    dailyRollup.set(key, current);
  }

  const performanceDaily = Array.from(dailyRollup.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({
      date,
      revenue: value.revenue,
      conversion_rate: uniqueViewers > 0 ? Number(((value.orders / uniqueViewers) * 100).toFixed(2)) : 0,
    }));

  const buyers = cohortMemberIds.map((buyerId) => {
    const buyer = buyersById.get(buyerId);
    const orderCount = validOrders.filter((order) => order.buyer_id === buyerId).length;
    const spend = validOrders
      .filter((order) => order.buyer_id === buyerId)
      .reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);

    const status = orderCount > 0 ? 'Ordered' : viewedBuyerIds.includes(buyerId) ? 'Viewed' : 'Not opened';

    return {
      buyer_id: buyerId,
      buyer_name: buyer?.business_name ?? 'Unknown buyer',
      status,
      spend,
      orders: orderCount,
    };
  });

  const publishedBy = catalog.created_by ? `User ${catalog.created_by.slice(0, 8)}` : 'System';
  const status = getDisplayStatus(catalog.status, catalog.valid_to);

  return NextResponse.json({
    header: {
      id: catalog.id,
      name: catalog.name,
      status_label: status.label,
      status_tone: status.tone,
      initials: getInitials(catalog.name),
      products_count: composition.length,
      brands_covered: brandsCovered,
      cohort_name: cohortName,
      valid_from_label: formatDate(catalog.valid_from),
      valid_until_label: formatDate(catalog.valid_to),
      valid_until_iso: catalog.valid_to,
      published_by: publishedBy,
      share_token: catalog.share_token,
      share_url: catalog.share_token ? `${request.nextUrl.origin}/shop/${catalog.share_token}` : null,
      scope_type: catalog.scope_type,
      status_value: catalog.status,
    },
    meta_strip_4: {
      gmv,
      growth_pct: growthPct,
      orders: totalOrders,
      conversion_rate: conversionRate,
      unique_viewers: uniqueViewers,
      cohort_members: cohortMemberIds.length,
      days_left: daysLeft,
      valid_until_label: formatDate(catalog.valid_to),
    },
    composition,
    performance: {
      funnel: {
        unique_viewers: uniqueViewers,
        cart_additions: cartAdds,
        orders: totalOrders,
        gmv,
      },
      daily: performanceDaily,
    },
    buyers,
    permissions: {
      can_extend_validity: claims.role === 'seller_admin',
      can_edit_composition: claims.role === 'seller_admin' && catalog.status === 'draft',
    },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const db = supabaseAdmin as DbClient;

  const { data: globalCatalog, error: globalCatalogError } = await db
    .schema('app')
    .from('published_catalogs')
    .select('id, tenant_id, status')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (globalCatalogError) return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
  if (!globalCatalog) return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });
  if (globalCatalog.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (parsed.data.action === 'extend_validity') {
    if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await db
      .schema('app')
      .from('published_catalogs')
      .update({ valid_to: parsed.data.valid_until, updated_by: null })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null);

    if (error) return NextResponse.json({ error: 'Failed to extend validity' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (globalCatalog.status !== 'draft') return NextResponse.json({ error: 'Composition can only be edited for draft catalogs' }, { status: 400 });

  if (parsed.data.action === 'add_product') {
    const { error } = await db
      .schema('app')
      .from('published_catalog_items')
      .insert({
        catalog_id: id,
        tenant_product_id: parsed.data.tenant_product_id,
        price_override: parsed.data.price_override ?? null,
        created_by: null,
        updated_by: null,
      });

    if (error) return NextResponse.json({ error: 'Failed to add product to catalog' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await db
    .schema('app')
    .from('published_catalog_items')
    .delete()
    .eq('catalog_id', id)
    .eq('tenant_product_id', parsed.data.tenant_product_id);

  if (error) return NextResponse.json({ error: 'Failed to remove product from catalog' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
