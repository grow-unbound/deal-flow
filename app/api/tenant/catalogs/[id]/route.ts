import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getPostHogQueryClient } from '@/lib/posthog-server';
import { revalidateSellerDashboardCache } from '@/lib/server/dashboard-cache';
import { getCatalogComposerPayload } from '@/lib/server/catalog-composer';
import { CatalogComposerPayloadSchema, type CatalogComposerFilterState, type CatalogComposerTag } from '@/lib/zod';

type DbClient = NonNullable<typeof supabaseAdmin>;

type CatalogStatus = 'draft' | 'published' | 'archived';

type ScopeType = 'cohort' | 'buyer' | 'geography' | 'all';
type ComposerScopeType = 'cohort' | 'all';

type CatalogDraftSnapshot = {
  name: string;
  valid_from: string;
  valid_to: string | null;
  scope_type: ComposerScopeType;
  cohort_id: string | null;
  filters: CatalogComposerFilterState;
  tag_overrides: Record<string, CatalogComposerTag | null>;
  items: Array<{
    tenant_product_id: string;
    display_order: number;
  }>;
};

const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('extend_validity'),
    valid_until: z.string().datetime(),
  }),
  z.object({
    action: z.literal('publish_catalog'),
  }),
  z.object({
    action: z.literal('ensure_share_link'),
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

function defaultCatalogFilters(): CatalogComposerFilterState {
  return {
    brand_names: [],
    category_names: [],
    availability: 'show_everything' as const,
  };
}

function buildCatalogScopeValue(input: {
  scopeType: 'cohort' | 'all';
  cohortId?: string | null;
  filters: CatalogComposerFilterState;
  tagOverrides?: Record<string, CatalogComposerTag | null>;
  draft?: CatalogDraftSnapshot | null;
}) {
  return {
    ...(input.scopeType === 'cohort' && input.cohortId ? { cohort_id: input.cohortId } : {}),
    composer: {
      filters: input.filters,
      tag_overrides: input.tagOverrides ?? {},
    },
    ...(input.draft ? { composer_draft: input.draft } : {}),
  };
}

function generateShareToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

function buildBuyerCatalogUrl(origin: string, shareToken: string) {
  return `${origin}/shop/catalog?share_token=${shareToken}`;
}

function buildCatalogDraftSnapshot(payload: z.infer<typeof CatalogComposerPayloadSchema>): CatalogDraftSnapshot {
  return {
    name: payload.name,
    valid_from: payload.valid_from.toISOString(),
    valid_to: payload.valid_to ? payload.valid_to.toISOString() : null,
    scope_type: payload.scope_type,
    cohort_id: payload.scope_type === 'cohort' ? (payload.cohort_id ?? null) : null,
    filters: payload.filters,
    tag_overrides: payload.tag_overrides,
    items: payload.items,
  };
}

async function ensureTenantProducts(
  db: DbClient,
  tenantId: string,
  tenantProductIds: string[],
) {
  if (tenantProductIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await db
    .schema('app')
    .from('tenant_products')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('id', tenantProductIds)
    .is('deleted_at', null);

  if (error) {
    throw new Error('Failed to validate selected products');
  }

  return new Set<string>(((data ?? []) as Array<{ id: string }>).map((row) => row.id));
}

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

function readScalarResult(payload: unknown): number {
  return Number((payload as { results?: Array<{ [k: string]: unknown }> })?.results?.[0]?.[0] ?? 0);
}

function readBuyerViewRows(payload: unknown): Array<{ buyerId: string; views: number; lastOpenedAt: string | null }> {
  const rows = ((payload as { results?: Array<{ [k: string]: unknown }> })?.results ?? []) as Array<unknown>;

  return rows
    .map((row) => {
      if (Array.isArray(row)) {
        return {
          buyerId: String(row[0] ?? ''),
          views: Number(row[1] ?? 0),
          lastOpenedAt: row[2] ? String(row[2]) : null,
        };
      }

      const objectRow = row as Record<string, unknown>;
      return {
        buyerId: String(objectRow.buyer_id ?? objectRow.buyerId ?? ''),
        views: Number(objectRow.views ?? 0),
        lastOpenedAt: objectRow.last_opened_at ? String(objectRow.last_opened_at) : null,
      };
    })
    .filter((row) => row.buyerId);
}

function extractBuyerCity(geography: unknown): string {
  if (!geography || typeof geography !== 'object') return 'Unknown';
  const city = (geography as { city?: unknown }).city;
  return typeof city === 'string' && city.trim().length > 0 ? city : 'Unknown';
}

function getOpenedStatus(orderCount: number, lastOpenedAt: string | null): 'Opened' | 'Purchased' | 'Not yet' {
  if (orderCount > 0) return 'Purchased';
  if (lastOpenedAt) return 'Opened';
  return 'Not yet';
}

type BuyerOpenMetrics = {
  views: number;
  lastOpenedAt: string | null;
};

async function fetchPosthogCatalogFunnel(catalogId: string): Promise<{ uniqueViewers: number; totalViews: number; cartAdds: number; buyerMetrics: Map<string, BuyerOpenMetrics> }> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const token = process.env.POSTHOG_PERSONAL_API_KEY;

  if (!projectId || !token) {
    return { uniqueViewers: 0, totalViews: 0, cartAdds: 0, buyerMetrics: new Map() };
  }

  try {
    const posthog = getPostHogQueryClient();

    const [cartAdds, buyerViews] = await Promise.all([
      posthog.query({
        kind: 'HogQLQuery',
        query: `
          SELECT count(*)
          FROM events
          WHERE event = 'catalog_item_added_to_cart'
            AND properties.catalog_id = {catalog_id:String}
        `,
        values: { catalog_id: catalogId },
      } as Record<string, unknown>),
      posthog.query({
        kind: 'HogQLQuery',
        query: `
          SELECT
            properties.buyer_id AS buyer_id,
            count(*) AS views,
            toString(max(timestamp)) AS last_opened_at
          FROM events
          WHERE event = 'catalog_viewed'
            AND properties.catalog_id = {catalog_id:String}
            AND properties.buyer_id IS NOT NULL
          GROUP BY properties.buyer_id
        `,
        values: { catalog_id: catalogId },
      } as Record<string, unknown>),
    ]);

    const buyerRows = readBuyerViewRows(buyerViews);
    const buyerMetrics = new Map<string, BuyerOpenMetrics>();
    let totalViews = 0;

    for (const row of buyerRows) {
      totalViews += row.views;
      buyerMetrics.set(row.buyerId, {
        views: row.views,
        lastOpenedAt: row.lastOpenedAt,
      });
    }

    return {
      uniqueViewers: buyerMetrics.size,
      totalViews,
      cartAdds: readScalarResult(cartAdds),
      buyerMetrics,
    };
  } catch {
    return { uniqueViewers: 0, totalViews: 0, cartAdds: 0, buyerMetrics: new Map() };
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

  const [catalogRes, itemsRes, ordersRes, composerPayload] = await Promise.all([
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
      .select('id, buyer_id, total_amount, placed_at, status, created_at')
      .eq('tenant_id', claims.tenant_id)
      .eq('catalog_id', id)
      .is('deleted_at', null),
    getCatalogComposerPayload(db, claims.tenant_id),
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
    created_at: string | null;
  }>;

  const scopeValue = (catalog.scope_value ?? {}) as { cohort_id?: string; buyer_id?: string };
  const composerScopeValue = (catalog.scope_value ?? {}) as {
    cohort_id?: string;
    composer?: {
      filters?: ReturnType<typeof defaultCatalogFilters>;
      tag_overrides?: Record<string, CatalogComposerTag | null>;
    };
    composer_draft?: CatalogDraftSnapshot;
  };
  const filters = composerScopeValue.composer?.filters ?? defaultCatalogFilters();
  const tagOverrides = composerScopeValue.composer?.tag_overrides ?? {};
  const composerDraft = composerScopeValue.composer_draft ?? null;

  let scopedBuyerIds: string[] = [];
  let selectedCohortId: string | null = null;
  let selectedCohortName = 'All buyers';

  if (catalog.scope_type === 'cohort' && scopeValue.cohort_id) {
    selectedCohortId = scopeValue.cohort_id;
    const [membersRes, cohortRes] = await Promise.all([
      db.schema('app').from('cohort_members').select('buyer_id').eq('cohort_id', scopeValue.cohort_id),
      db.schema('app').from('cohorts').select('name').eq('id', scopeValue.cohort_id).maybeSingle(),
    ]);

    if (membersRes.error) return NextResponse.json({ error: 'Failed to load cohort members' }, { status: 500 });
    scopedBuyerIds = ((membersRes.data ?? []) as Array<{ buyer_id: string }>).map((row) => row.buyer_id);
    if (!cohortRes.error && cohortRes.data?.name) selectedCohortName = cohortRes.data.name;
  } else if (catalog.scope_type === 'buyer' && scopeValue.buyer_id) {
    scopedBuyerIds = [scopeValue.buyer_id];
    const buyerRes = await db.schema('app').from('buyers').select('business_name').eq('id', scopeValue.buyer_id).maybeSingle();
    if (!buyerRes.error && buyerRes.data?.business_name) selectedCohortName = buyerRes.data.business_name;
  } else {
    const allBuyersRes = await db
      .schema('app')
      .from('buyers')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (allBuyersRes.error) return NextResponse.json({ error: 'Failed to load buyers' }, { status: 500 });
    scopedBuyerIds = ((allBuyersRes.data ?? []) as Array<{ id: string }>).map((row) => row.id);
    selectedCohortName = catalog.scope_type === 'all' ? 'All buyers' : 'Targeted buyers';
  }

  const cohortMemberIds = Array.from(new Set(scopedBuyerIds));
  const buyersRes = cohortMemberIds.length
    ? await db
        .schema('app')
        .from('buyers')
        .select('id, business_name, geography, tier')
        .in('id', cohortMemberIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  if (buyersRes.error) return NextResponse.json({ error: 'Failed to load buyers' }, { status: 500 });

  const buyersById = new Map(
    ((buyersRes.data ?? []) as Array<{ id: string; business_name: string; geography: unknown; tier: string | null }>).map((buyer) => [
      buyer.id,
      buyer,
    ]),
  );

  const tenantProductIds = catalogItems.map((item) => item.tenant_product_id);
  const orderIds = orders.map((order) => order.id);
  const validOrders = orders.filter((order) => order.status !== 'cancelled');
  const validOrderIds = new Set(validOrders.map((order) => order.id));
  const productMetaById = new Map(composerPayload.products.map((product) => [product.id, product]));

  const orderItemsRes = orderIds.length && tenantProductIds.length
    ? await db
        .schema('app')
        .from('order_items')
        .select('order_id, tenant_product_id, qty, line_total, unit_price')
        .in('order_id', orderIds)
        .in('tenant_product_id', tenantProductIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  if (orderItemsRes.error) return NextResponse.json({ error: 'Failed to load order items' }, { status: 500 });

  const orderItems = (orderItemsRes.data ?? []) as Array<{
    order_id: string;
    tenant_product_id: string;
    qty: number | null;
    line_total: number | null;
    unit_price: number | null;
  }>;

  const { uniqueViewers, totalViews, cartAdds, buyerMetrics } = await fetchPosthogCatalogFunnel(id);

  const orderCountByBuyer = new Map<string, number>();
  const spendByBuyer = new Map<string, number>();
  const lastOrderAtByBuyer = new Map<string, string | null>();
  const skuMetricsByProduct = new Map<string, { units: number; gmv: number }>();
  const dailyRollup = new Map<string, { revenue: number; orders: number }>();

  for (const order of validOrders) {
    orderCountByBuyer.set(order.buyer_id, (orderCountByBuyer.get(order.buyer_id) ?? 0) + 1);
    spendByBuyer.set(order.buyer_id, (spendByBuyer.get(order.buyer_id) ?? 0) + Number(order.total_amount ?? 0));

    const nextLastOrder = order.placed_at ?? order.created_at ?? null;
    const existingLastOrder = lastOrderAtByBuyer.get(order.buyer_id);
    if (!existingLastOrder || (nextLastOrder && new Date(nextLastOrder).getTime() > new Date(existingLastOrder).getTime())) {
      lastOrderAtByBuyer.set(order.buyer_id, nextLastOrder);
    }

    if (!order.placed_at) continue;
    const date = dayKey(order.placed_at);
    const current = dailyRollup.get(date) ?? { revenue: 0, orders: 0 };
    current.revenue += Number(order.total_amount ?? 0);
    current.orders += 1;
    dailyRollup.set(date, current);
  }

  for (const item of orderItems) {
    if (!validOrderIds.has(item.order_id)) continue;
    const current = skuMetricsByProduct.get(item.tenant_product_id) ?? { units: 0, gmv: 0 };
    const qty = Number(item.qty ?? 0);
    const lineTotal = Number(item.line_total ?? (qty * Number(item.unit_price ?? 0)));
    current.units += qty;
    current.gmv += lineTotal;
    skuMetricsByProduct.set(item.tenant_product_id, current);
  }

  const gmv = validOrders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
  const totalOrders = validOrders.length;
  const aov = totalOrders > 0 ? gmv / totalOrders : 0;

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
  const conversionRate = uniqueViewers > 0 ? Number(((totalOrders / uniqueViewers) * 100).toFixed(1)) : 0;
  const abandoners = Math.max(0, buyerMetrics.size - new Set(validOrders.map((order) => order.buyer_id)).size);
  const today = Date.now();
  const daysLeft = catalog.valid_to ? Math.max(0, Math.ceil((new Date(catalog.valid_to).getTime() - today) / (1000 * 60 * 60 * 24))) : 0;

  const products = catalogItems.map((item, index) => {
    const composerProduct = productMetaById.get(item.tenant_product_id);
    const catalogMetrics = skuMetricsByProduct.get(item.tenant_product_id) ?? { units: 0, gmv: 0 };
    return {
      tenant_product_id: item.tenant_product_id,
      product_name: composerProduct?.display_name ?? 'Unknown product',
      internal_sku: composerProduct?.internal_sku ?? item.tenant_product_id,
      brand_name: composerProduct?.brand_name ?? 'Unknown brand',
      catalog_gmv: catalogMetrics.gmv,
      catalog_units_sold: catalogMetrics.units,
      stock_label: composerProduct?.stock_label ?? 'Out',
      stock_tone: composerProduct?.stock_tone ?? 'neutral',
      mrp: composerProduct?.mrp ?? null,
      base_selling_price: composerProduct?.base_selling_price ?? null,
      units_mtd: composerProduct?.units_mtd ?? 0,
      days_cover: composerProduct?.days_cover ?? null,
      tag: tagOverrides[item.tenant_product_id] ?? composerProduct?.tag ?? null,
      override_price: item.price_override != null ? Number(item.price_override) : null,
      catalog_order: item.display_order ?? index,
    };
  });

  const composition = products.map((product) => ({
    tenant_product_id: product.tenant_product_id,
    product: product.product_name,
    brand: product.brand_name,
    mrp: Number(product.mrp ?? 0),
    catalog_price: Number(product.base_selling_price ?? 0),
    override_price: product.override_price,
    stock_status: product.stock_tone === 'warning' ? 'Low stock' : product.stock_tone === 'success' ? 'In stock' : 'Out of stock',
  }));

  const brandsCovered = new Set(products.map((item) => item.brand_name)).size;

  const performanceDaily = Array.from(dailyRollup.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({
      date,
      revenue: value.revenue,
      conversion_rate: uniqueViewers > 0 ? Number(((value.orders / uniqueViewers) * 100).toFixed(2)) : 0,
    }));

  const cumulativeOrders = Array.from(dailyRollup.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .reduce<Array<{ date: string; orders_cumulative: number; gmv_cumulative: number }>>((acc, [date, value]) => {
      const previous = acc[acc.length - 1] ?? { orders_cumulative: 0, gmv_cumulative: 0 };
      acc.push({
        date,
        orders_cumulative: previous.orders_cumulative + value.orders,
        gmv_cumulative: previous.gmv_cumulative + value.revenue,
      });
      return acc;
    }, []);

  const safeCumulativeOrders =
    cumulativeOrders.length > 0
      ? cumulativeOrders
      : [{ date: dayKey(catalog.valid_from), orders_cumulative: 0, gmv_cumulative: 0 }];

  const topSkus = products
    .map((product) => {
      const metrics = skuMetricsByProduct.get(product.tenant_product_id) ?? { units: 0, gmv: 0 };
      return {
        tenant_product_id: product.tenant_product_id,
        product_name: product.product_name,
        internal_sku: product.internal_sku,
        gmv: metrics.gmv,
        units: metrics.units,
        catalog_order: product.catalog_order,
      };
    })
    .sort((a, b) => {
      if (b.gmv !== a.gmv) return b.gmv - a.gmv;
      if (b.units !== a.units) return b.units - a.units;
      return a.catalog_order - b.catalog_order;
    })
    .map(({ catalog_order, ...row }) => row);

  const buyers = cohortMemberIds
    .map((buyerId) => {
      const buyer = buyersById.get(buyerId);
      const buyerOrderCount = orderCountByBuyer.get(buyerId) ?? 0;
      const spend = spendByBuyer.get(buyerId) ?? 0;
      const openMetrics = buyerMetrics.get(buyerId);
      const lastOpenedAt = openMetrics?.lastOpenedAt ?? null;
      const lastOrderAt = lastOrderAtByBuyer.get(buyerId) ?? null;

      return {
        buyer_id: buyerId,
        buyer_name: buyer?.business_name ?? 'Unknown buyer',
        city: extractBuyerCity(buyer?.geography),
        cohort_label: selectedCohortName,
        opened_status: getOpenedStatus(buyerOrderCount, lastOpenedAt),
        spend,
        orders: buyerOrderCount,
        last_opened_at: lastOpenedAt,
        last_order_at: lastOrderAt,
      };
    })
    .sort((a, b) => {
      if (b.spend !== a.spend) return b.spend - a.spend;
      if (b.orders !== a.orders) return b.orders - a.orders;
      return a.buyer_name.localeCompare(b.buyer_name);
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
      products_count: products.length,
      brands_covered: brandsCovered,
      cohort_name: selectedCohortName,
      valid_from_label: formatDate(catalog.valid_from),
      valid_until_label: formatDate(catalog.valid_to),
      valid_until_iso: catalog.valid_to,
      published_by: publishedBy,
      share_token: catalog.share_token,
      share_url: catalog.share_token ? buildBuyerCatalogUrl(request.nextUrl.origin, catalog.share_token) : null,
      scope_type: catalog.scope_type,
      status_value: catalog.status,
      selected_cohort: {
        id: selectedCohortId,
        name: selectedCohortName,
        member_count: cohortMemberIds.length,
        scope_type: catalog.scope_type,
        display_label: selectedCohortName,
      },
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
    products_summary: {
      filters,
      included_count: products.length,
      brands_covered: brandsCovered,
      in_stock_count: products.filter((product) => product.stock_tone === 'success').length,
      tag_overrides_count: Object.values(tagOverrides).filter(Boolean).length,
    },
    products,
    performance: {
      summary: {
        orders: totalOrders,
        gmv,
        growth_pct: growthPct,
        aov,
        views: totalViews,
        unique_viewers: uniqueViewers,
        conversion_rate: conversionRate,
        abandoners,
        valid_until_label: formatDate(catalog.valid_to),
        published_at_label: formatDate(catalog.created_at),
      },
      funnel: {
        unique_viewers: uniqueViewers,
        cart_additions: cartAdds,
        orders: totalOrders,
        gmv,
      },
      daily: performanceDaily,
      cumulative_orders: safeCumulativeOrders,
      top_skus: topSkus,
      per_buyer_activity: buyers.map((buyer) => ({
        buyer_id: buyer.buyer_id,
        buyer_name: buyer.buyer_name,
        city: buyer.city,
        opened_status: buyer.opened_status,
        orders: buyer.orders,
        gmv: buyer.spend,
        last_opened_at: buyer.last_opened_at,
        last_order_at: buyer.last_order_at,
      })),
    },
    buyers,
    permissions: {
      can_extend_validity: claims.role === 'seller_admin',
      can_edit_composition: claims.role === 'seller_admin',
    },
    composer: {
      name: composerDraft?.name ?? catalog.name,
      status: composerDraft ? 'draft' : catalog.status,
      live_status: catalog.status,
      has_unpublished_changes: Boolean(composerDraft),
      valid_from: composerDraft?.valid_from ?? catalog.valid_from,
      valid_to: composerDraft?.valid_to ?? catalog.valid_to,
      scope_type: composerDraft?.scope_type ?? (catalog.scope_type === 'all' ? 'all' : 'cohort'),
      cohort_id: composerDraft?.cohort_id ?? composerScopeValue.cohort_id ?? null,
      filters: composerDraft?.filters ?? filters,
      tag_overrides: composerDraft?.tag_overrides ?? tagOverrides,
      items: (composerDraft?.items ?? catalogItems.map((item) => ({
        tenant_product_id: item.tenant_product_id,
        display_order: item.display_order ?? 0,
      }))),
    },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const rawBody = await request.json().catch(() => null);
  const actionParsed = PatchSchema.safeParse(rawBody);
  const composerParsed = actionParsed.success ? null : CatalogComposerPayloadSchema.safeParse(rawBody);
  if (!actionParsed.success && !composerParsed?.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const db = supabaseAdmin as DbClient;

  const { data: globalCatalog, error: globalCatalogError } = await db
    .schema('app')
    .from('published_catalogs')
    .select('id, tenant_id, status, share_token, scope_type, scope_value')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (globalCatalogError) return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
  if (!globalCatalog) return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });
  if (globalCatalog.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (actionParsed.success && actionParsed.data.action === 'extend_validity') {
    if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await db
      .schema('app')
      .from('published_catalogs')
      .update({ valid_to: actionParsed.data.valid_until, updated_by: claims.sub })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null);

    if (error) return NextResponse.json({ error: 'Failed to extend validity' }, { status: 500 });
    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({ ok: true });
  }

  if (actionParsed.success && actionParsed.data.action === 'publish_catalog') {
    if (globalCatalog.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft catalogs can be published' }, { status: 400 });
    }

    const shareToken = globalCatalog.share_token ?? generateShareToken();
    const { error } = await db
      .schema('app')
      .from('published_catalogs')
      .update({
        status: 'published',
        share_token: shareToken,
        updated_by: claims.sub,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null);

    if (error) return NextResponse.json({ error: 'Failed to publish catalog' }, { status: 500 });

    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({
      ok: true,
      share_link: {
        share_token: shareToken,
        share_url: buildBuyerCatalogUrl(request.nextUrl.origin, shareToken),
      },
    });
  }

  if (actionParsed.success && actionParsed.data.action === 'ensure_share_link') {
    if (globalCatalog.status !== 'published') {
      return NextResponse.json({ error: 'Share links are only available for published catalogs' }, { status: 400 });
    }

    const shareToken = globalCatalog.share_token ?? generateShareToken();
    if (!globalCatalog.share_token) {
      const { error } = await db
        .schema('app')
        .from('published_catalogs')
        .update({
          share_token: shareToken,
          updated_by: claims.sub,
        })
        .eq('id', id)
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null);

      if (error) return NextResponse.json({ error: 'Failed to generate share link' }, { status: 500 });
      revalidateSellerDashboardCache(claims.tenant_id);
    }

    return NextResponse.json({
      share_link: {
        share_token: shareToken,
        share_url: buildBuyerCatalogUrl(request.nextUrl.origin, shareToken),
      },
    });
  }

  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (actionParsed.success && actionParsed.data.action === 'add_product') {
    if (globalCatalog.status !== 'draft') return NextResponse.json({ error: 'Composition can only be edited for draft catalogs' }, { status: 400 });
    const { error } = await db
      .schema('app')
      .from('published_catalog_items')
      .insert({
        catalog_id: id,
        tenant_product_id: actionParsed.data.tenant_product_id,
        price_override: actionParsed.data.price_override ?? null,
        created_by: claims.sub,
        updated_by: claims.sub,
      });

    if (error) return NextResponse.json({ error: 'Failed to add product to catalog' }, { status: 500 });
    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({ ok: true });
  }

  if (actionParsed.success && actionParsed.data.action === 'remove_product') {
    if (globalCatalog.status !== 'draft') return NextResponse.json({ error: 'Composition can only be edited for draft catalogs' }, { status: 400 });
    const { error } = await db
      .schema('app')
      .from('published_catalog_items')
      .update({ deleted_at: new Date().toISOString(), updated_by: claims.sub })
      .eq('catalog_id', id)
      .eq('tenant_product_id', actionParsed.data.tenant_product_id)
      .is('deleted_at', null);

    if (error) return NextResponse.json({ error: 'Failed to remove product from catalog' }, { status: 500 });
    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({ ok: true });
  }

  if (!composerParsed?.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload = composerParsed.data;
  if (payload.scope_type === 'cohort') {
    const { data: cohort, error: cohortError } = await db
      .schema('app')
      .from('cohorts')
      .select('id')
      .eq('id', payload.cohort_id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (cohortError) return NextResponse.json({ error: 'Failed to validate cohort' }, { status: 500 });
    if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 400 });
  }

  const tenantProductIds = payload.items.map((item) => item.tenant_product_id);
  const validProductIds = await ensureTenantProducts(db, claims.tenant_id, tenantProductIds);
  if (validProductIds.size !== tenantProductIds.length) {
    return NextResponse.json({ error: 'One or more selected products are invalid' }, { status: 400 });
  }

  if (globalCatalog.status === 'published' && payload.save_mode === 'draft') {
    const liveScopeValue = (globalCatalog.scope_value ?? {}) as {
      composer?: {
        filters?: CatalogComposerFilterState;
        tag_overrides?: Record<string, CatalogComposerTag | null>;
      };
    };

    const { data: savedDraft, error: saveDraftError } = await db
      .schema('app')
      .from('published_catalogs')
      .update({
        scope_value: buildCatalogScopeValue({
          scopeType: (globalCatalog.scope_type as ComposerScopeType) === 'all' ? 'all' : 'cohort',
          cohortId: ((globalCatalog.scope_value ?? {}) as { cohort_id?: string }).cohort_id ?? null,
          filters: liveScopeValue.composer?.filters ?? defaultCatalogFilters(),
          tagOverrides: liveScopeValue.composer?.tag_overrides ?? {},
          draft: buildCatalogDraftSnapshot(payload),
        }),
        updated_by: claims.sub,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .select('id, status')
      .single();

    if (saveDraftError || !savedDraft) {
      return NextResponse.json({ error: 'Failed to save unpublished changes' }, { status: 500 });
    }

    return NextResponse.json({ catalog: savedDraft });
  }

  if (globalCatalog.status !== 'draft' && !(globalCatalog.status === 'published' && payload.save_mode === 'publish')) {
    return NextResponse.json({ error: 'Composition can only be edited for draft catalogs' }, { status: 400 });
  }

  const nextStatus: CatalogStatus = payload.save_mode === 'publish' ? 'published' : 'draft';
  const { data: updatedCatalog, error: updateCatalogError } = await db
    .schema('app')
    .from('published_catalogs')
    .update({
      name: payload.name,
      scope_type: payload.scope_type,
      scope_value: buildCatalogScopeValue({
        scopeType: payload.scope_type,
        cohortId: payload.cohort_id,
        filters: payload.filters,
        tagOverrides: payload.tag_overrides,
        draft: null,
      }),
      valid_from: payload.valid_from.toISOString(),
      valid_to: payload.valid_to ? payload.valid_to.toISOString() : null,
      status: nextStatus,
      share_token: nextStatus === 'published' ? globalCatalog.share_token ?? generateShareToken() : globalCatalog.share_token,
      updated_by: claims.sub,
    })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .select('id, status')
    .single();

  if (updateCatalogError || !updatedCatalog) {
    return NextResponse.json({ error: 'Failed to update catalog' }, { status: 500 });
  }

  const deletedAt = new Date().toISOString();
  const { error: deleteItemsError } = await db
    .schema('app')
    .from('published_catalog_items')
    .update({ deleted_at: deletedAt, updated_by: claims.sub })
    .eq('catalog_id', id)
    .is('deleted_at', null);

  if (deleteItemsError) {
    return NextResponse.json({ error: 'Failed to refresh catalog items' }, { status: 500 });
  }

  if (payload.items.length > 0) {
    const { error: insertItemsError } = await db
      .schema('app')
      .from('published_catalog_items')
      .upsert(
        payload.items.map((item) => ({
          catalog_id: id,
          tenant_product_id: item.tenant_product_id,
          display_order: item.display_order,
          deleted_at: null,
          created_by: claims.sub,
          updated_by: claims.sub,
        })),
        { onConflict: 'catalog_id,tenant_product_id' },
      );

    if (insertItemsError) {
      return NextResponse.json({ error: 'Failed to save catalog items' }, { status: 500 });
    }
  }

  revalidateSellerDashboardCache(claims.tenant_id);
  return NextResponse.json({ catalog: updatedCatalog });
}
