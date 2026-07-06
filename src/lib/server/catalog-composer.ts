import type { CatalogComposerTag } from '@/lib/zod';
import { PAGE_SIZE } from '@/lib/pagination';

type StockTone = 'success' | 'warning' | 'neutral';

interface TenantProductRow {
  id: string;
  internal_sku: string;
  name_override: string | null;
  tenant_brand_id: string | null;
  tenant_category_id: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  cost_price: number | null;
  created_at: string;
}

interface TenantBrandRow {
  id: string;
  display_name_override: string | null;
}

interface CohortRow {
  id: string;
  name: string;
  cached_member_count?: number | null;
}

interface CohortMemberRow {
  cohort_id: string;
  buyer_id: string;
}

interface InventoryRow {
  tenant_product_id: string;
  qty_available: number | null;
  reorder_point: number | null;
  updated_at?: string | null;
}

interface OrderItemRow {
  order_id: string;
  tenant_product_id: string;
  qty: number | null;
}

interface BuyerRow {
  id: string;
  business_name: string;
  contact_name: string | null;
  external_ref: string | null;
  tier: 'A' | 'B' | 'C' | null;
  geography: { city?: string; state?: string } | null;
  credit_limit: number | null;
  payment_terms_days: number | null;
}

interface PriceListRow {
  id: string;
  name: string;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}

interface PriceListItemRow {
  price_list_id: string;
  tenant_product_id: string;
  price: number | null;
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function dbErr(label: string, error: { code?: string; message?: string } | null | undefined): Error {
  const detail = error ? `[${error.code ?? 'unknown'}] ${error.message ?? ''}` : 'unknown db error';
  return new Error(`${label}: ${detail}`);
}

function initials(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'BY';
}

function filterOptions(values: string[]) {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = raw.trim() || 'Unknown';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function priceListStatus(row: PriceListRow, nowTs: number): 'active' | 'draft' | 'expired' {
  const validFromTs = row.valid_from ? new Date(row.valid_from).getTime() : Number.NEGATIVE_INFINITY;
  const validToTs = row.valid_to ? new Date(row.valid_to).getTime() : Number.POSITIVE_INFINITY;
  if (validToTs < nowTs) return 'expired';
  if (!row.is_active) return 'draft';
  if (validFromTs > nowTs) return 'draft';
  return 'active';
}

export async function getCatalogComposerPayload(db: any, tenantId: string, role?: string | null) {
  const now = new Date();
  const nowIso = now.toISOString();
  const nowTs = now.getTime();
  const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const threeDaysAgoTs = now.getTime() - 3 * 24 * 60 * 60 * 1000;
  const sevenDaysAgoTs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const monthStartIso = startOfMonth(now).toISOString();
  const todayStartTs = startOfDay(now).getTime();

  // Phase 1: fetch data that doesn't depend on each other.
  // cohort_members is intentionally excluded here — it must be scoped to this
  // tenant's cohort IDs, which we only know after the cohorts query resolves.
  const PRODUCTS_LIMIT = PAGE_SIZE.MAX;
  const BUYERS_LIMIT = PAGE_SIZE.MAX;
  const PRICE_LISTS_LIMIT = PAGE_SIZE.MAX;
  const canViewCost = role === 'seller_admin';

  const [productsRes, cohortsRes, recentOrdersRes, monthOrdersRes, buyersCountRes, buyersRes, priceListsRes] = await Promise.all([
    db
      .schema('app')
      .from('tenant_products')
      .select('id, internal_sku, name_override, tenant_brand_id, tenant_category_id, mrp, base_selling_price, cost_price, created_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PRODUCTS_LIMIT),
    db
      .schema('app')
      .from('cohorts')
      .select('id, name, cached_member_count')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('orders')
      .select('id, placed_at')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('placed_at', thirtyDaysAgoIso),
    db
      .schema('app')
      .from('orders')
      .select('id, placed_at')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('placed_at', monthStartIso),
    db
      .schema('app')
      .from('buyers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('buyers')
      .select('id, business_name, contact_name, external_ref, tier, geography, credit_limit, payment_terms_days')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('business_name', { ascending: true })
      .limit(BUYERS_LIMIT),
    db
      .schema('app')
      .from('price_lists')
      .select('id, name, is_active, valid_from, valid_to')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .or(`is_active.eq.false,valid_to.is.null,valid_to.gt.${nowIso}`)
      .order('updated_at', { ascending: false })
      .limit(PRICE_LISTS_LIMIT),
  ]);

  if (productsRes.error) throw dbErr('catalog-composer: tenant_products', productsRes.error);
  if (cohortsRes.error) throw dbErr('catalog-composer: cohorts', cohortsRes.error);
  if (recentOrdersRes.error) throw dbErr('catalog-composer: recent_orders', recentOrdersRes.error);
  if (monthOrdersRes.error) throw dbErr('catalog-composer: month_orders', monthOrdersRes.error);
  if (buyersCountRes.error) throw dbErr('catalog-composer: buyers', buyersCountRes.error);
  if (buyersRes.error) throw dbErr('catalog-composer: buyer_rows', buyersRes.error);
  if (priceListsRes.error) throw dbErr('catalog-composer: price_lists', priceListsRes.error);

  const products = (productsRes.data ?? []) as TenantProductRow[];
  const cohorts = (cohortsRes.data ?? []) as CohortRow[];
  const recentOrders = (recentOrdersRes.data ?? []) as Array<{ id: string; placed_at: string | null }>;
  const monthOrders = (monthOrdersRes.data ?? []) as Array<{ id: string; placed_at: string | null }>;
  const buyersCount = buyersCountRes.count ?? 0;
  const buyers = (buyersRes.data ?? []) as BuyerRow[];
  const priceLists = ((priceListsRes.data ?? []) as PriceListRow[])
    .map((priceList) => ({ ...priceList, status: priceListStatus(priceList, nowTs) }))
    .filter((priceList) => priceList.status === 'active' || priceList.status === 'draft');

  const cohortIds = cohorts.map((c) => c.id);
  const productIds = products.map((p) => p.id);
  const buyerIds = buyers.map((buyer) => buyer.id);
  const priceListIds = priceLists.map((priceList) => priceList.id);
  const recentOrderIds = recentOrders.map((o) => o.id);
  const monthOrderIds = monthOrders.map((o) => o.id);
  const allOrderIds = Array.from(new Set([...recentOrderIds, ...monthOrderIds]));

  // Phase 2: queries that depend on phase-1 IDs. Run in parallel.
  const tenantCategoryIds = Array.from(new Set(products.map((p) => p.tenant_category_id).filter(Boolean))) as string[];
  const [cohortMembersRes, orderItemsRes, inventoryRes, tenantCategoriesRes, buyerOrderItemsRes, priceListItemsRes] = await Promise.all([
    cohortIds.length > 0
      ? db
          .schema('app')
          .from('cohort_members')
          .select('cohort_id, buyer_id')
          .in('cohort_id', cohortIds)
      : Promise.resolve({ data: [], error: null }),
    allOrderIds.length > 0
      ? db
          .schema('app')
          .from('order_items')
          .select('order_id, tenant_product_id, qty')
          .in('order_id', allOrderIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    productIds.length > 0
      ? db
          .schema('app')
          .from('tenant_inventory')
          .select('tenant_product_id, qty_available, reorder_point, updated_at')
          .in('tenant_product_id', productIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    tenantCategoryIds.length > 0
      ? db
          .schema('app')
          .from('tenant_categories')
          .select('id, name')
          .in('id', tenantCategoryIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    buyerIds.length > 0
      ? db
          .schema('app')
          .from('orders')
          .select('id, buyer_id, total_amount, placed_at')
          .eq('tenant_id', tenantId)
          .neq('status', 'cancelled')
          .is('deleted_at', null)
          .in('buyer_id', buyerIds)
          .gte('placed_at', thirtyDaysAgoIso)
      : Promise.resolve({ data: [], error: null }),
    priceListIds.length > 0
      ? db
          .schema('app')
          .from('price_list_items')
          .select('price_list_id, tenant_product_id, price')
          .in('price_list_id', priceListIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (cohortMembersRes.error) throw dbErr('catalog-composer: cohort_members', cohortMembersRes.error);
  if (orderItemsRes.error) throw dbErr('catalog-composer: order_items', orderItemsRes.error);
  if (inventoryRes.error) throw dbErr('catalog-composer: tenant_inventory', inventoryRes.error);
  if (tenantCategoriesRes.error) throw dbErr('catalog-composer: tenant_categories', tenantCategoriesRes.error);
  if (buyerOrderItemsRes.error) throw dbErr('catalog-composer: buyer_orders', buyerOrderItemsRes.error);
  if (priceListItemsRes.error) throw dbErr('catalog-composer: price_list_items', priceListItemsRes.error);

  const cohortMembers = (cohortMembersRes.data ?? []) as CohortMemberRow[];
  const orderItems = (orderItemsRes.data ?? []) as OrderItemRow[];
  const buyerOrders = (buyerOrderItemsRes.data ?? []) as Array<{ buyer_id: string | null; total_amount: number | null; placed_at: string | null }>;
  const priceListItems = (priceListItemsRes.data ?? []) as PriceListItemRow[];

  // Phase 3: brand lookups chained from product brand IDs.
  const tenantBrandIds = Array.from(new Set(products.map((p) => p.tenant_brand_id).filter(Boolean))) as string[];
  const tenantBrandsRes = tenantBrandIds.length > 0
    ? await db
        .schema('app')
        .from('tenant_brands')
        .select('id, display_name_override')
        .in('id', tenantBrandIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  if (tenantBrandsRes.error) throw dbErr('catalog-composer: tenant_brands', tenantBrandsRes.error);

  const tenantBrands = (tenantBrandsRes.data ?? []) as TenantBrandRow[];
  const categoryNameById = new Map(
    ((tenantCategoriesRes.data ?? []) as Array<{ id: string; name: string | null }>).map((category) => [category.id, category.name]),
  );

  // Build lookup maps. Sum qty across locations; keep the latest stock update per product.
  const inventoryByProductId = new Map<string, InventoryRow>();
  for (const row of (inventoryRes.data ?? []) as InventoryRow[]) {
    const existing = inventoryByProductId.get(row.tenant_product_id);
    if (!existing) {
      inventoryByProductId.set(row.tenant_product_id, { ...row });
      continue;
    }
    existing.qty_available = Number(existing.qty_available ?? 0) + Number(row.qty_available ?? 0);
    existing.reorder_point = Math.max(Number(existing.reorder_point ?? 0), Number(row.reorder_point ?? 0));
    const existingUpdatedTs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
    const rowUpdatedTs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    if (rowUpdatedTs > existingUpdatedTs) existing.updated_at = row.updated_at;
  }
  const tenantBrandById = new Map(tenantBrands.map((b) => [b.id, b]));
  const monthOrderIdSet = new Set(monthOrderIds);
  const recentOrderPlacedAtById = new Map(recentOrders.map((o) => [o.id, o.placed_at]));
  const unitsMtdByProductId = new Map<string, number>();
  const hasRecentOrderByProductId = new Set<string>();

  for (const item of orderItems) {
    if (monthOrderIdSet.has(item.order_id)) {
      unitsMtdByProductId.set(item.tenant_product_id, (unitsMtdByProductId.get(item.tenant_product_id) ?? 0) + Number(item.qty ?? 0));
    }
    if (recentOrderPlacedAtById.get(item.order_id)) {
      hasRecentOrderByProductId.add(item.tenant_product_id);
    }
  }

  const daysElapsed = Math.max(1, Math.ceil((Date.now() - startOfMonth(now).getTime()) / (1000 * 60 * 60 * 24)));
  const memberCountByCohort = new Map<string, number>();
  for (const row of cohortMembers) {
    memberCountByCohort.set(row.cohort_id, (memberCountByCohort.get(row.cohort_id) ?? 0) + 1);
  }

  const buyerStats = new Map<string, { orders30d: number; gmv30d: number; lastOrderAt: string | null }>();
  for (const order of buyerOrders) {
    if (!order.buyer_id) continue;
    const current = buyerStats.get(order.buyer_id) ?? { orders30d: 0, gmv30d: 0, lastOrderAt: null };
    current.orders30d += 1;
    current.gmv30d += Number(order.total_amount ?? 0);
    if (order.placed_at && (!current.lastOrderAt || new Date(order.placed_at).getTime() > new Date(current.lastOrderAt).getTime())) {
      current.lastOrderAt = order.placed_at;
    }
    buyerStats.set(order.buyer_id, current);
  }

  return {
    buyer_count: buyersCount,
    cohorts: cohorts.map((cohort) => ({
      id: cohort.id,
      name: cohort.name,
      member_count: cohort.cached_member_count ?? memberCountByCohort.get(cohort.id) ?? 0,
    })),
    products: products.map((product) => {
      const inventory = inventoryByProductId.get(product.id);
      const qtyAvailable = Number(inventory?.qty_available ?? 0);
      const reorderPoint = Number(inventory?.reorder_point ?? 0);
      const brand = product.tenant_brand_id ? tenantBrandById.get(product.tenant_brand_id) : null;
      const brandName = brand
        ? brand.display_name_override?.trim() || 'Brand'
        : 'Brand';
      const categoryName =
        product.tenant_category_id ? categoryNameById.get(product.tenant_category_id) ?? null : null;
      const unitsMtd = unitsMtdByProductId.get(product.id) ?? 0;
      const dailyRunRate = unitsMtd > 0 ? unitsMtd / daysElapsed : 0;
      const daysCover = qtyAvailable > 0 && dailyRunRate > 0 ? Math.round((qtyAvailable / dailyRunRate) * 10) / 10 : null;
      const productCreatedTs = new Date(product.created_at).getTime();
      const inventoryUpdatedTs = inventory?.updated_at ? new Date(inventory.updated_at).getTime() : 0;
      const stockAddedToday = qtyAvailable > 0 && inventoryUpdatedTs >= todayStartTs;
      const tag: CatalogComposerTag | null =
        productCreatedTs >= sevenDaysAgoTs
          ? 'new'
          : qtyAvailable > 0 && inventoryUpdatedTs >= threeDaysAgoTs
            ? 'new_stock'
            : !hasRecentOrderByProductId.has(product.id)
              ? 'old_stock'
              : null;
      const stockTone: StockTone = qtyAvailable <= 0 ? 'neutral' : reorderPoint > 0 && qtyAvailable <= reorderPoint ? 'warning' : 'success';
      const stockLabel = qtyAvailable <= 0 ? 'Out' : `${qtyAvailable}`;

      return {
        id: product.id,
        display_name:
          product.name_override?.trim() ||
          product.internal_sku,
        internal_sku: product.internal_sku,
        brand_name: brandName,
        category_name: categoryName,
        mrp: product.mrp,
        base_selling_price: product.base_selling_price,
        cost_price: canViewCost ? product.cost_price : null,
        qty_available: qtyAvailable,
        reorder_point: reorderPoint,
        units_mtd: unitsMtd,
        days_cover: daysCover,
        tag,
        stock_added_today: stockAddedToday,
        stock_label: stockLabel,
        stock_tone: stockTone,
      };
    }),
    buyers: buyers.map((buyer, index) => {
      const stats = buyerStats.get(buyer.id) ?? { orders30d: 0, gmv30d: 0, lastOrderAt: null };
      const city = buyer.geography?.city ?? null;
      const state = buyer.geography?.state ?? null;
      return {
        id: buyer.id,
        business_name: buyer.business_name,
        contact_name: buyer.contact_name,
        external_ref: buyer.external_ref,
        city,
        state,
        geography_label: [city, state].filter(Boolean).join(', ') || 'Unknown',
        tier: buyer.tier,
        credit_limit: Number(buyer.credit_limit ?? 0),
        payment_terms_days: Number(buyer.payment_terms_days ?? 0),
        orders_30d: stats.orders30d,
        gmv_30d: stats.gmv30d,
        last_order_at: stats.lastOrderAt,
        initials: initials(buyer.business_name),
        hue: index % 3 === 1 ? 'ember' : index % 3 === 2 ? 'cream' : 'teal',
      };
    }),
    buyer_filters: {
      geographies: filterOptions(buyers.map((buyer) => [buyer.geography?.city, buyer.geography?.state].filter(Boolean).join(', ') || 'Unknown')),
      tiers: filterOptions(buyers.map((buyer) => buyer.tier ?? 'Unsorted')),
    },
    price_lists: priceLists.map((priceList) => ({
      id: priceList.id,
      name: priceList.name,
      status: priceList.status,
      valid_from: priceList.valid_from,
      valid_to: priceList.valid_to,
    })),
    price_list_items: priceListItems.map((item) => ({
      price_list_id: item.price_list_id,
      tenant_product_id: item.tenant_product_id,
      price: Number(item.price ?? 0),
    })),
    can_view_cost: canViewCost,
  };
}
