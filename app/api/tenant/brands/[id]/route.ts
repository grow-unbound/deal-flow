import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { TenantBrandUpdateSchema } from '@/lib/zod';

type DbClient = NonNullable<typeof supabaseAdmin>;
type OrderRow = {
  id: string;
  buyer_id: string;
  status: string;
  total_amount: number | null;
  placed_at: string | null;
  catalog_id: string | null;
};
type OrderItemRow = {
  order_id: string;
  tenant_product_id: string;
  qty: number | null;
  line_total: number | null;
  unit_price: number | null;
};
type BuyerRow = {
  id: string;
  business_name: string;
  tier: string | null;
  is_active: boolean;
  geography: { city?: string; state?: string } | null;
};
type ProductRow = {
  id: string;
  master_product_id: string | null;
  internal_sku: string;
  name_override: string | null;
};

function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    startIso: start.toISOString(),
    nextIso: next.toISOString(),
    prevStartIso: prevStart.toISOString(),
    prevEndIso: prevEnd.toISOString(),
  };
}

function toNullableText(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as DbClient as any;

  const { data: globalBrand, error: globalBrandError } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id, tenant_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (globalBrandError) return NextResponse.json({ error: 'Failed to fetch brand' }, { status: 500 });
  if (!globalBrand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  if (globalBrand.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: tenantBrand, error: brandError } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id, tenant_id, master_brand_id, display_name_override, slug, description, logo_url, margin_pct, exclusivity, is_active, external_ref, principal_name, principal_email, principal_phone, principal_location, contact_name, contact_email, contact_phone, default_cohort_id, created_at, updated_at, deleted_at')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .single();

  if (brandError || !tenantBrand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

  const { data: masterBrand } = tenantBrand.master_brand_id
    ? await db
        .schema('catalog')
        .from('brands')
        .select('id, name, slug, description, logo_url')
        .eq('id', tenantBrand.master_brand_id)
        .maybeSingle()
    : { data: null };

  const { data: tenantProducts } = await db
    .schema('app')
    .from('tenant_products')
    .select('id, master_product_id, internal_sku, name_override, base_selling_price, is_active')
    .eq('tenant_id', claims.tenant_id)
    .eq('tenant_brand_id', id)
    .is('deleted_at', null);

  const productIds = (tenantProducts ?? []).map((p: { id: string }) => p.id);
  const masterProductIds = Array.from(
    new Set((tenantProducts ?? []).map((p: { master_product_id: string | null }) => p.master_product_id).filter(Boolean))
  ) as string[];

  const masterProductsRes = masterProductIds.length
    ? await db.schema('catalog').from('products').select('id, name').in('id', masterProductIds)
    : { data: [] };

  const [buyersRes, allBuyersRes, inventoryRes, catalogsItemsRes, auditRes] = await Promise.all([
    db
      .schema('app')
      .from('buyers')
      .select('id, business_name, tier, is_active, geography, created_at')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('buyers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null),
    productIds.length
      ? db
          .schema('app')
          .from('tenant_inventory')
          .select('tenant_product_id, qty_available, reorder_point')
          .in('tenant_product_id', productIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? db
          .schema('app')
          .from('published_catalog_items')
          .select('catalog_id, tenant_product_id, updated_at')
          .in('tenant_product_id', productIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    db
      .schema('app')
      .from('audit_log')
      .select('id, entity_type, entity_id, action, ts, diff')
      .eq('tenant_id', claims.tenant_id)
      .order('ts', { ascending: false })
      .limit(250),
  ]);

  const catalogIds = Array.from(new Set((catalogsItemsRes.data ?? []).map((item: { catalog_id: string }) => item.catalog_id)));

  const [catalogsRes, ordersRes] = await Promise.all([
    catalogIds.length
      ? db
          .schema('app')
          .from('published_catalogs')
          .select('id, name, scope_type, scope_value, status, valid_from, valid_to, updated_at, created_at')
          .in('id', catalogIds)
          .eq('tenant_id', claims.tenant_id)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, status, total_amount, placed_at, catalog_id')
      .eq('tenant_id', claims.tenant_id)
      .neq('status', 'cancelled')
      .is('deleted_at', null),
  ]);

  const orderIds = (ordersRes.data ?? []).map((order: { id: string }) => order.id);
  const cohortIds = Array.from(
    new Set(
      (catalogsRes.data ?? [])
        .filter((catalog: any) => catalog.scope_type === 'cohort' && catalog.scope_value?.cohort_id)
        .map((catalog: any) => String(catalog.scope_value.cohort_id))
    )
  );
  const cohortNamesRes = cohortIds.length
    ? await db.schema('app').from('cohorts').select('id, name').in('id', cohortIds).is('deleted_at', null)
    : { data: [] };
  const cohortNameById = new Map<string, string>((cohortNamesRes.data ?? []).map((cohort: any) => [cohort.id, cohort.name]));

  const orderItemsRes = orderIds.length
    ? await db
        .schema('app')
        .from('order_items')
        .select('order_id, tenant_product_id, qty, line_total, unit_price')
        .in('order_id', orderIds)
        .is('deleted_at', null)
    : { data: [] };

  const now = new Date();
  const { startIso, nextIso, prevStartIso, prevEndIso } = monthBounds(now);

  const buyers = (buyersRes.data ?? []) as BuyerRow[];
  const orders = (ordersRes.data ?? []) as OrderRow[];
  const orderItems = (orderItemsRes.data ?? []) as OrderItemRow[];
  const tenantProductsRows = (tenantProducts ?? []) as ProductRow[];
  const buyersById = new Map(buyers.map((b) => [b.id, b]));
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const brandOrderIds = new Set<string>();
  const orderRevenueByOrder = new Map<string, number>();
  const productRevenue = new Map<string, { units: number; revenue: number }>();

  for (const item of orderItems) {
    if (!productIds.includes(item.tenant_product_id)) continue;
    brandOrderIds.add(item.order_id);
    orderRevenueByOrder.set(item.order_id, (orderRevenueByOrder.get(item.order_id) ?? 0) + Number(item.line_total ?? (Number(item.qty) * Number(item.unit_price))));
    const current = productRevenue.get(item.tenant_product_id) ?? { units: 0, revenue: 0 };
    current.units += Number(item.qty ?? 0);
    current.revenue += Number(item.line_total ?? (Number(item.qty) * Number(item.unit_price)));
    productRevenue.set(item.tenant_product_id, current);
  }

  let gmvMtd = 0;
  let gmvPrev = 0;
  const activeBuyerSet = new Set<string>();
  const totalBuyerSet = new Set<string>();
  const monthlyTrendMap = new Map<string, number>();
  const buyerSpendMap = new Map<string, { spend: number; orders: number; lastOrder: string | null }>();
  const catalogStatsMap = new Map<string, { orders: number; gmv: number }>();

  for (const orderId of brandOrderIds) {
    const order = orderById.get(orderId);
    if (!order) continue;
    const placedAt = order.placed_at ? new Date(order.placed_at) : null;
    const amount = orderRevenueByOrder.get(orderId) ?? Number(order.total_amount ?? 0);
    const buyerId = order.buyer_id as string;

    totalBuyerSet.add(buyerId);

    if (placedAt && order.status !== 'cancelled') {
      const placedIso = placedAt.toISOString();
      if (placedIso >= startIso && placedIso < nextIso) {
        gmvMtd += amount;
        activeBuyerSet.add(buyerId);
      }
      if (placedIso >= prevStartIso && placedIso < prevEndIso) {
        gmvPrev += amount;
      }
      const monthKey = `${placedAt.getUTCFullYear()}-${String(placedAt.getUTCMonth() + 1).padStart(2, '0')}`;
      monthlyTrendMap.set(monthKey, (monthlyTrendMap.get(monthKey) ?? 0) + amount);
    }

    const buyerCurrent = buyerSpendMap.get(buyerId) ?? { spend: 0, orders: 0, lastOrder: null };
    buyerCurrent.spend += amount;
    buyerCurrent.orders += 1;
    if (!buyerCurrent.lastOrder || (order.placed_at && order.placed_at > buyerCurrent.lastOrder)) {
      buyerCurrent.lastOrder = order.placed_at;
    }
    buyerSpendMap.set(buyerId, buyerCurrent);

    if (order.catalog_id) {
      const catalogCurrent = catalogStatsMap.get(order.catalog_id) ?? { orders: 0, gmv: 0 };
      catalogCurrent.orders += 1;
      catalogCurrent.gmv += amount;
      catalogStatsMap.set(order.catalog_id, catalogCurrent);
    }
  }

  const growthPct = gmvPrev > 0 ? ((gmvMtd - gmvPrev) / gmvPrev) * 100 : 0;

  const lowStockCount = (inventoryRes.data ?? []).filter((row: any) => {
    const available = Number(row.qty_available ?? 0);
    const reorder = Number(row.reorder_point ?? 0);
    return reorder > 0 && available <= reorder;
  }).length;

  const latestCatalogAt = (catalogsRes.data ?? [])
    .map((catalog: any) => catalog.updated_at ?? catalog.created_at)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null;

  const latestCatalogName = (catalogsRes.data ?? [])
    .slice()
    .sort((a: any, b: any) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())[0]?.name ?? null;

  const daysSinceCatalog = latestCatalogAt
    ? Math.max(0, Math.floor((Date.now() - new Date(latestCatalogAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const monthlyTrend = Array.from(monthlyTrendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, revenue]) => ({ month, revenue }));

  const buyersRows = Array.from(buyerSpendMap.entries()).map(([buyerId, stats]) => {
    const buyer = buyersById.get(buyerId);
    const city = buyer?.geography?.city ?? buyer?.geography?.state ?? '—';
    return {
      id: buyerId,
      name: buyer?.business_name ?? 'Unknown buyer',
      cohort: buyer?.tier ? `Tier ${buyer.tier}` : '—',
      spend: stats.spend,
      orders: stats.orders,
      last_order: stats.lastOrder,
      status: buyer?.is_active ? 'Active' : 'Inactive',
      city,
    };
  }).sort((a, b) => b.spend - a.spend);

  const productsMap = new Map(tenantProductsRows.map((p) => [p.id, p]));
  const masterProductNameMap = new Map(
    (masterProductsRes.data ?? []).map((masterProduct: { id: string; name: string }) => [masterProduct.id, masterProduct.name])
  );
  const topSkus = Array.from(productRevenue.entries())
    .map(([productId, stats]) => ({
      product_id: productId,
      product:
        productsMap.get(productId)?.name_override ??
        masterProductNameMap.get(productsMap.get(productId)?.master_product_id ?? '') ??
        productsMap.get(productId)?.internal_sku ??
        'Unknown product',
      sku: productsMap.get(productId)?.internal_sku ?? '—',
      units: stats.units,
      revenue: stats.revenue,
      growth: 0,
      days_cover: null as number | null,
      status: stats.revenue > 0 ? 'On pace' : 'Idle',
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const catalogsRows = (catalogsRes.data ?? []).map((catalog: any) => {
    const stats = catalogStatsMap.get(catalog.id) ?? { orders: 0, gmv: 0 };
    return {
      id: catalog.id,
      name: catalog.name,
      cohort:
        catalog.scope_type === 'cohort'
          ? cohortNameById.get(String(catalog.scope_value?.cohort_id ?? '')) ?? 'Cohort'
          : catalog.scope_type === 'all'
            ? 'All buyers'
            : catalog.scope_type === 'buyer'
              ? 'Buyer-specific'
              : catalog.scope_type,
      gmv: stats.gmv,
      orders: stats.orders,
      status: catalog.status,
      sent_at: catalog.updated_at ?? catalog.created_at,
    };
  }).sort((a: { sent_at: string }, b: { sent_at: string }) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

  const relatedEntityIds = new Set<string>([id, ...productIds, ...buyersRows.map((b) => b.id), ...catalogsRows.map((c: { id: string }) => c.id)]);
  const relatedEntityTypes = new Set(['tenant_brand', 'tenant_product', 'buyer', 'published_catalog', 'catalog']);

  const activity = (auditRes.data ?? [])
    .filter((entry: any) => relatedEntityIds.has(entry.entity_id) || relatedEntityTypes.has(entry.entity_type))
    .slice(0, 100)
    .map((entry: any) => ({
      id: String(entry.id),
      at: entry.ts,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      summary: `${entry.action} ${entry.entity_type}`,
      diff: entry.diff,
    }));

  const topBuyers = buyersRows.map((buyer) => ({
    ...buyer,
    orders_label: `${buyer.orders} orders`,
  }));

  const totalBuyersCount = allBuyersRes.count ?? buyersById.size;
  const portfolioShare = 0;

  return NextResponse.json({
    header: {
      id: tenantBrand.id,
      brand_name: tenantBrand.display_name_override ?? 'Unknown brand',
      category: tenantBrand.description ? 'Brand principal' : 'Uncategorized',
      region: 'Maharashtra',
      carried_since: tenantBrand.created_at,
      skus: tenantProducts?.length ?? 0,
      portfolio_share_pct: portfolioShare,
      status_label: tenantBrand.is_active ? 'ON PACE' : 'INACTIVE',
      status_tone: tenantBrand.is_active ? 'success' : 'neutral',
      initials: (tenantBrand.display_name_override ?? 'BR')
        .split(' ')
        .map((token: string) => token[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      hue: 'teal',
    },
    meta_strip_4: {
      gmv_mtd: gmvMtd,
      growth_pct: growthPct,
      active_buyers: activeBuyerSet.size,
      total_buyers: totalBuyersCount,
      low_stock_skus: lowStockCount,
      days_since_catalog: daysSinceCatalog,
      last_sent_date: latestCatalogAt,
      latest_catalog_name: latestCatalogName,
    },
    details: {
      id: tenantBrand.id,
      tenant_id: tenantBrand.tenant_id,
      master_brand_id: tenantBrand.master_brand_id,
      display_name_override: tenantBrand.display_name_override,
      slug: tenantBrand.slug,
      description: tenantBrand.description,
      logo_url: tenantBrand.logo_url,
      margin_pct: tenantBrand.margin_pct,
      exclusivity: tenantBrand.exclusivity,
      is_active: tenantBrand.is_active,
      external_ref: tenantBrand.external_ref,
      principal_name: tenantBrand.principal_name,
      principal_email: tenantBrand.principal_email,
      principal_phone: tenantBrand.principal_phone,
      principal_location: tenantBrand.principal_location,
      contact_name: tenantBrand.contact_name,
      contact_email: tenantBrand.contact_email,
      contact_phone: tenantBrand.contact_phone,
      default_cohort_id: tenantBrand.default_cohort_id,
      created_at: tenantBrand.created_at,
      updated_at: tenantBrand.updated_at,
      deleted_at: tenantBrand.deleted_at,
    },
    performance: {
      monthly_trend: monthlyTrend,
      cohort_breakdown: [
        { cohort: 'Tier A', spend: buyersRows.filter((b) => b.cohort === 'Tier A').reduce((sum, b) => sum + b.spend, 0) },
        { cohort: 'Tier B', spend: buyersRows.filter((b) => b.cohort === 'Tier B').reduce((sum, b) => sum + b.spend, 0) },
        { cohort: 'Tier C', spend: buyersRows.filter((b) => b.cohort === 'Tier C').reduce((sum, b) => sum + b.spend, 0) },
      ],
      top_skus: topSkus,
      top_buyers: topBuyers,
      catalog_history: catalogsRows.slice(0, 10),
      insights: {
        margin_avg_pct: tenantBrand.margin_pct ?? 0,
        sell_through_pct: 0,
        repeat_rate_pct: 0,
        buyer_reach: `${activeBuyerSet.size}/${totalBuyersCount}`,
      },
    },
    buyers: buyersRows,
    catalogs: catalogsRows,
    activity,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const body = await request.json().catch(() => null);
  const parsed = TenantBrandUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const db = supabaseAdmin as DbClient as any;

  const { data: existing } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id, tenant_id, slug')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  if (existing.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.display_name_override !== undefined) payload.display_name_override = toNullableText(parsed.data.display_name_override);
  if (parsed.data.slug !== undefined) payload.slug = toNullableText(parsed.data.slug);
  if (parsed.data.description !== undefined) payload.description = toNullableText(parsed.data.description);
  if (parsed.data.logo_url !== undefined) payload.logo_url = toNullableText(parsed.data.logo_url);
  if (parsed.data.margin_pct !== undefined) payload.margin_pct = parsed.data.margin_pct;
  if (parsed.data.exclusivity !== undefined) payload.exclusivity = parsed.data.exclusivity;
  if (parsed.data.external_ref !== undefined) payload.external_ref = toNullableText(parsed.data.external_ref);
  if (parsed.data.principal_name !== undefined) payload.principal_name = toNullableText(parsed.data.principal_name);
  if (parsed.data.principal_email !== undefined) payload.principal_email = toNullableText(parsed.data.principal_email);
  if (parsed.data.principal_phone !== undefined) payload.principal_phone = toNullableText(parsed.data.principal_phone);
  if (parsed.data.principal_location !== undefined) payload.principal_location = toNullableText(parsed.data.principal_location);
  if (parsed.data.contact_name !== undefined) payload.contact_name = toNullableText(parsed.data.contact_name);
  if (parsed.data.contact_email !== undefined) payload.contact_email = toNullableText(parsed.data.contact_email);
  if (parsed.data.contact_phone !== undefined) payload.contact_phone = toNullableText(parsed.data.contact_phone);
  if (parsed.data.default_cohort_id !== undefined) payload.default_cohort_id = parsed.data.default_cohort_id;
  if (parsed.data.is_active !== undefined) payload.is_active = parsed.data.is_active;
  if (parsed.data.archive) payload.deleted_at = new Date().toISOString();

  if (parsed.data.default_cohort_id) {
    const { data: cohort } = await db
      .schema('app')
      .from('cohorts')
      .select('id')
      .eq('id', parsed.data.default_cohort_id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!cohort) {
      return NextResponse.json({ error: 'Selected cohort is invalid for this tenant.' }, { status: 400 });
    }
  }

  if (payload.slug && payload.slug !== existing.slug) {
    const { data: slugMatch } = await db
      .schema('app')
      .from('tenant_brands')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('slug', payload.slug)
      .is('deleted_at', null)
      .neq('id', id)
      .maybeSingle();

    if (slugMatch) {
      return NextResponse.json({ error: 'A brand with this slug already exists.' }, { status: 409 });
    }
  }

  const { data: updated, error } = await db
    .schema('app')
    .from('tenant_brands')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 });

  return NextResponse.json({ brand: updated });
}
