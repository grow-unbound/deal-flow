import type { CatalogComposerTag } from '@/lib/zod';

type StockTone = 'success' | 'warning' | 'neutral';

interface TenantProductRow {
  id: string;
  internal_sku: string;
  name_override: string | null;
  tenant_brand_id: string | null;
  master_product_id: string | null;
  category_name: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  created_at: string;
}

interface TenantBrandRow {
  id: string;
  display_name_override: string | null;
  master_brand_id: string;
}

interface MasterBrandRow {
  id: string;
  name: string;
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

export async function getCatalogComposerPayload(db: any, tenantId: string) {
  const now = new Date();
  const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const threeDaysAgoTs = now.getTime() - 3 * 24 * 60 * 60 * 1000;
  const sevenDaysAgoTs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const monthStartIso = startOfMonth(now).toISOString();
  const todayStartTs = startOfDay(now).getTime();

  // Phase 1: fetch data that doesn't depend on each other.
  // cohort_members is intentionally excluded here — it must be scoped to this
  // tenant's cohort IDs, which we only know after the cohorts query resolves.
  const [productsRes, cohortsRes, recentOrdersRes, monthOrdersRes] = await Promise.all([
    db
      .schema('app')
      .from('tenant_products')
      .select('id, internal_sku, name_override, tenant_brand_id, master_product_id, category_name, mrp, base_selling_price, created_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
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
  ]);

  if (productsRes.error) throw dbErr('catalog-composer: tenant_products', productsRes.error);
  if (cohortsRes.error) throw dbErr('catalog-composer: cohorts', cohortsRes.error);
  if (recentOrdersRes.error) throw dbErr('catalog-composer: recent_orders', recentOrdersRes.error);
  if (monthOrdersRes.error) throw dbErr('catalog-composer: month_orders', monthOrdersRes.error);

  const products = (productsRes.data ?? []) as TenantProductRow[];
  const cohorts = (cohortsRes.data ?? []) as CohortRow[];
  const recentOrders = (recentOrdersRes.data ?? []) as Array<{ id: string; placed_at: string | null }>;
  const monthOrders = (monthOrdersRes.data ?? []) as Array<{ id: string; placed_at: string | null }>;

  const cohortIds = cohorts.map((c) => c.id);
  const productIds = products.map((p) => p.id);
  const recentOrderIds = recentOrders.map((o) => o.id);
  const monthOrderIds = monthOrders.map((o) => o.id);
  const allOrderIds = Array.from(new Set([...recentOrderIds, ...monthOrderIds]));

  // Phase 2: queries that depend on phase-1 IDs. Run in parallel.
  const [cohortMembersRes, orderItemsRes, inventoryRes] = await Promise.all([
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
  ]);

  if (cohortMembersRes.error) throw dbErr('catalog-composer: cohort_members', cohortMembersRes.error);
  if (orderItemsRes.error) throw dbErr('catalog-composer: order_items', orderItemsRes.error);
  if (inventoryRes.error) throw dbErr('catalog-composer: tenant_inventory', inventoryRes.error);

  const cohortMembers = (cohortMembersRes.data ?? []) as CohortMemberRow[];
  const orderItems = (orderItemsRes.data ?? []) as OrderItemRow[];

  // Phase 3: brand lookups chained from product brand IDs.
  const tenantBrandIds = Array.from(new Set(products.map((p) => p.tenant_brand_id).filter(Boolean))) as string[];
  const tenantBrandsRes = tenantBrandIds.length > 0
    ? await db
        .schema('app')
        .from('tenant_brands')
        .select('id, display_name_override, master_brand_id')
        .in('id', tenantBrandIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  if (tenantBrandsRes.error) throw dbErr('catalog-composer: tenant_brands', tenantBrandsRes.error);

  const tenantBrands = (tenantBrandsRes.data ?? []) as TenantBrandRow[];
  const masterBrandIds = Array.from(new Set(tenantBrands.map((b) => b.master_brand_id)));
  const masterProductIds = Array.from(new Set(products.map((p) => p.master_product_id).filter(Boolean))) as string[];

  const [masterBrandsRes, masterProductsRes] = await Promise.all([
    masterBrandIds.length > 0
      ? db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds).is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    masterProductIds.length > 0
      ? db.schema('catalog').from('products').select('id, category_id').in('id', masterProductIds).is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (masterBrandsRes.error) throw dbErr('catalog-composer: master_brands', masterBrandsRes.error);
  if (masterProductsRes.error) throw dbErr('catalog-composer: master_products', masterProductsRes.error);

  const masterProducts = (masterProductsRes.data ?? []) as Array<{ id: string; category_id: string | null }>;
  const categoryIds = Array.from(new Set(masterProducts.map((product) => product.category_id).filter(Boolean))) as string[];
  const categoriesRes = categoryIds.length > 0
    ? await db.schema('catalog').from('categories').select('id, name').in('id', categoryIds).is('deleted_at', null)
    : { data: [], error: null };

  if (categoriesRes.error) throw dbErr('catalog-composer: master_categories', categoriesRes.error);

  const categoryNameById = new Map(((categoriesRes.data ?? []) as Array<{ id: string; name: string }>).map((category) => [category.id, category.name]));
  const categoryNameByMasterProductId = new Map(
    masterProducts
      .filter((product) => product.category_id)
      .map((product) => [product.id, categoryNameById.get(product.category_id!) ?? null]),
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
  const masterBrandById = new Map(((masterBrandsRes.data ?? []) as MasterBrandRow[]).map((b) => [b.id, b.name]));
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

  return {
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
        ? brand.display_name_override ?? masterBrandById.get(brand.master_brand_id) ?? 'Unknown brand'
        : 'Unknown brand';
      const categoryName =
        product.category_name?.trim() ||
        (product.master_product_id ? categoryNameByMasterProductId.get(product.master_product_id) ?? null : null);
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
        display_name: product.name_override?.trim() || product.internal_sku,
        internal_sku: product.internal_sku,
        brand_name: brandName,
        category_name: categoryName,
        mrp: product.mrp,
        base_selling_price: product.base_selling_price,
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
  };
}
