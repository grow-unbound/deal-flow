import { loadInventoryAvailabilityMap } from '@/lib/server/warehouse-inventory';
import {
  deriveVelocity,
  enquiryStockStatus,
  pickAlternates,
  type AlternateCandidate,
  type EnquiryTriageLine,
  type EnquiryTriagePayload,
} from '@/lib/inbox/enquiry-triage';

type DbClient = any;

const ALTERNATE_POOL_LIMIT = 40;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/**
 * Read-only triage view of a `new_enquiry` estimate: lines with stock, precomputed
 * 90-day velocity (`app.metrics_product_snapshot`) and same-category alternates for
 * lines that can't be covered. Caller has already verified tenant + location access.
 */
export async function loadEnquiryTriage(
  db: DbClient,
  tenantId: string,
  estimateId: string,
): Promise<EnquiryTriagePayload | null> {
  const d = db as any;

  const [estimateRes, itemsRes] = await Promise.all([
    d.schema('app').from('estimates')
      .select('id, tenant_id, buyer_id, location_id, estimate_number, status, total_amount, notes, estimate_type, price_visibility')
      .eq('id', estimateId).eq('tenant_id', tenantId).is('deleted_at', null).maybeSingle(),
    d.schema('app').from('estimate_items')
      .select('id, tenant_product_id, qty, unit_price, item_order, buyer_target_unit_price_min, buyer_target_unit_price_max, buyer_note')
      .eq('estimate_id', estimateId).is('deleted_at', null).order('item_order', { ascending: true }),
  ]);
  if (estimateRes.error) throw estimateRes.error;
  if (itemsRes.error) throw itemsRes.error;
  const estimate = estimateRes.data as Record<string, unknown> | null;
  if (!estimate) return null;

  const buyerId = asString(estimate.buyer_id);
  const items = (itemsRes.data ?? []) as Array<Record<string, unknown>>;
  const productIds = Array.from(new Set(items.map((i) => asString(i.tenant_product_id)).filter((v): v is string => !!v)));
  const locationId = asString(estimate.location_id);

  const [productsRes, inventory, snapshotRes] = await Promise.all([
    productIds.length
      ? d.schema('app').from('tenant_products')
          .select('id, internal_sku, name_override, master_product_id, tenant_brand_id, tenant_category_id')
          .in('id', productIds).eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] }),
    loadInventoryAvailabilityMap(d, productIds, locationId),
    productIds.length
      ? d.schema('app').from('metrics_product_snapshot')
          .select('tenant_product_id, invoice_units_90d, days_cover, last_invoice_at')
          .eq('tenant_id', tenantId).in('tenant_product_id', productIds).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
  ]);

  const products = (productsRes.data ?? []) as Array<Record<string, unknown>>;
  const productMap = new Map(products.map((p) => [p.id as string, p]));
  const snapshotMap = new Map(((snapshotRes.data ?? []) as Array<Record<string, unknown>>).map((s) => [s.tenant_product_id as string, s]));

  // Alternates only for lines that need them.
  const needsAlt = items.filter((i) => {
    const pid = asString(i.tenant_product_id);
    return pid && enquiryStockStatus(Number(i.qty ?? 0), inventory.get(pid) ?? 0).tone !== 'ok';
  });
  const categoryIds = Array.from(new Set(
    needsAlt.map((i) => asString(productMap.get(i.tenant_product_id as string)?.tenant_category_id)).filter((v): v is string => !!v),
  ));
  const shortBrandIds = Array.from(new Set(
    needsAlt.map((i) => asString(productMap.get(i.tenant_product_id as string)?.tenant_brand_id)).filter((v): v is string => !!v),
  ));

  const poolCandidates: AlternateCandidate[] = [];
  const nameSources: Array<Record<string, unknown>> = [...products];
  let poolRows: Array<Record<string, unknown>> = [];
  if (needsAlt.length) {
    const cols = 'id, internal_sku, name_override, master_product_id, tenant_brand_id, tenant_category_id';
    // Same category first; same-brand products from other categories fill the gap.
    const [catRes, brandRes] = await Promise.all([
      categoryIds.length
        ? d.schema('app').from('tenant_products').select(cols)
            .eq('tenant_id', tenantId).in('tenant_category_id', categoryIds).is('deleted_at', null).limit(ALTERNATE_POOL_LIMIT * categoryIds.length)
        : Promise.resolve({ data: [] }),
      shortBrandIds.length
        ? d.schema('app').from('tenant_products').select(cols)
            .eq('tenant_id', tenantId).in('tenant_brand_id', shortBrandIds).is('deleted_at', null).limit(ALTERNATE_POOL_LIMIT * shortBrandIds.length)
        : Promise.resolve({ data: [] }),
    ]);
    const seen = new Set<string>();
    poolRows = [...((catRes.data ?? []) as Array<Record<string, unknown>>), ...((brandRes.data ?? []) as Array<Record<string, unknown>>)]
      .filter((r) => {
        const id = r.id as string;
        if (productMap.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    nameSources.push(...poolRows);
  }

  const poolIds = poolRows.map((r) => r.id as string);
  const [poolInventory, poolSnapshotRes] = await Promise.all([
    loadInventoryAvailabilityMap(d, poolIds, locationId),
    poolIds.length
      ? d.schema('app').from('metrics_product_snapshot')
          .select('tenant_product_id, invoice_units_90d, days_cover, last_invoice_at')
          .eq('tenant_id', tenantId).in('tenant_product_id', poolIds).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
  ]);
  const poolSnapshotMap = new Map(((poolSnapshotRes.data ?? []) as Array<Record<string, unknown>>).map((s) => [s.tenant_product_id as string, s]));

  const masterIds = Array.from(new Set(nameSources.map((p) => asString(p.master_product_id)).filter((v): v is string => !!v)));
  const brandIds = Array.from(new Set(nameSources.map((p) => asString(p.tenant_brand_id)).filter((v): v is string => !!v)));
  const [masterRes, brandRes] = await Promise.all([
    masterIds.length ? d.schema('catalog').from('products').select('id, name').in('id', masterIds) : Promise.resolve({ data: [] }),
    brandIds.length ? d.schema('app').from('tenant_brands').select('id, display_name_override, master_brand_id').in('id', brandIds).eq('tenant_id', tenantId) : Promise.resolve({ data: [] }),
  ]);
  const masterBrandIds = Array.from(new Set(((brandRes.data ?? []) as Array<Record<string, unknown>>).map((b) => asString(b.master_brand_id)).filter((v): v is string => !!v)));
  const masterBrandRes = masterBrandIds.length ? await d.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds) : { data: [] };

  const masterName = new Map(((masterRes.data ?? []) as Array<Record<string, unknown>>).map((m) => [m.id as string, m.name as string]));
  const masterBrandName = new Map(((masterBrandRes.data ?? []) as Array<Record<string, unknown>>).map((b) => [b.id as string, b.name as string]));
  const brandName = new Map(((brandRes.data ?? []) as Array<Record<string, unknown>>).map((b) => [
    b.id as string,
    (asString(b.display_name_override)?.trim() || masterBrandName.get(b.master_brand_id as string) || null) as string | null,
  ]));

  const nameOf = (p: Record<string, unknown>) =>
    asString(p.name_override)?.trim() || masterName.get(p.master_product_id as string) || asString(p.internal_sku) || 'Product';
  const brandOf = (p: Record<string, unknown>) => brandName.get(p.tenant_brand_id as string) ?? null;

  for (const row of poolRows) {
    poolCandidates.push({
      tenantProductId: row.id as string,
      name: nameOf(row),
      sku: asString(row.internal_sku) ?? '—',
      brandId: asString(row.tenant_brand_id),
      brandName: brandOf(row),
      categoryId: asString(row.tenant_category_id),
      available: poolInventory.get(row.id as string) ?? 0,
      velocity: deriveVelocity(poolSnapshotMap.get(row.id as string)),
    });
  }

  // Resolve what this buyer would actually pay for each suggested alternate (app.resolve_price,
  // same precedence catalog display uses) -- without it the seller can't judge the swap's impact.
  const altPriceKey = (productId: string, qty: number) => `${productId}:${qty}`;
  const altPriceMap = new Map<string, number>();
  if (buyerId) {
    const altsByQty = new Map<number, Set<string>>();
    for (const item of items) {
      const pid = asString(item.tenant_product_id);
      const qty = Number(item.qty ?? 0);
      if (!pid || enquiryStockStatus(qty, inventory.get(pid) ?? 0).tone === 'ok') continue;
      const catId = asString(productMap.get(pid)?.tenant_category_id);
      const brandId = asString(productMap.get(pid)?.tenant_brand_id);
      const alts = pickAlternates({ tenantProductId: pid, brandId, categoryId: catId, qty }, poolCandidates);
      const set = altsByQty.get(qty) ?? new Set<string>();
      for (const alt of alts) set.add(alt.tenantProductId);
      altsByQty.set(qty, set);
    }
    const responses = await Promise.all(
      Array.from(altsByQty.entries()).map(async ([qty, ids]) => {
        const { data, error } = await d.schema('app').rpc('resolve_prices_batch', {
          p_tenant_product_ids: Array.from(ids),
          p_buyer_id: buyerId,
          p_qty: qty,
        });
        if (error) { console.error('[load-enquiry-triage] resolve_prices_batch', error); return { qty, rows: [] as Array<{ tenant_product_id: string; unit_price: number }> }; }
        return { qty, rows: (data ?? []) as Array<{ tenant_product_id: string; unit_price: number }> };
      }),
    );
    for (const { qty, rows } of responses) {
      for (const row of rows) altPriceMap.set(altPriceKey(row.tenant_product_id, qty), Number(row.unit_price ?? 0));
    }
  }

  const lines: EnquiryTriageLine[] = items.map((item) => {
    const pid = item.tenant_product_id as string;
    const product = productMap.get(pid);
    const qty = Number(item.qty ?? 0);
    const onHand = inventory.get(pid) ?? 0;
    const stock = enquiryStockStatus(qty, onHand);
    return {
      id: item.id as string,
      tenantProductId: pid,
      name: product ? nameOf(product) : 'Product',
      sku: asString(product?.internal_sku) ?? '—',
      brandName: product ? brandOf(product) : null,
      qty,
      unitPrice: item.unit_price == null ? null : Number(item.unit_price),
      targetMin: item.buyer_target_unit_price_min == null ? null : Number(item.buyer_target_unit_price_min),
      targetMax: item.buyer_target_unit_price_max == null ? null : Number(item.buyer_target_unit_price_max),
      buyerNote: asString(item.buyer_note),
      onHand,
      stock,
      velocity: deriveVelocity(snapshotMap.get(pid)),
      alternates: stock.tone !== 'ok'
        ? pickAlternates({
            tenantProductId: pid,
            brandId: asString(product?.tenant_brand_id),
            categoryId: asString(product?.tenant_category_id),
            qty,
          }, poolCandidates).map((alt) => ({
            ...alt,
            buyerPrice: altPriceMap.get(altPriceKey(alt.tenantProductId, qty)) ?? null,
          }))
        : [],
    };
  });

  return {
    estimateId,
    estimateNumber: asString(estimate.estimate_number) ?? '—',
    status: asString(estimate.status) ?? 'unknown',
    hiddenPricing: estimate.estimate_type === 'without_price' || estimate.price_visibility === 'hide_price',
    totalAmount: estimate.total_amount == null ? null : Number(estimate.total_amount),
    notes: asString(estimate.notes),
    lines,
  };
}
