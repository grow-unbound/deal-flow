export interface CampaignOrderRow {
  id: string;
  buyer_id: string;
  total_amount: number | null;
  placed_at: string | null;
  status: string;
  created_at: string | null;
}

export interface CampaignEstimateRow {
  id: string;
  buyer_id: string;
  total_amount: number | null;
  status: string;
  converted_to_order_id: string | null;
  created_at: string | null;
}

export interface CampaignViewRow {
  buyer_id: string;
  campaign_id: string;
  viewed_at: string;
  view_date?: string | null;
}

export interface CampaignLineItemRow {
  tenant_product_id: string;
  qty: number | null;
  line_total: number | null;
  unit_price: number | null;
}

export type CampaignBuyerOpenedStatus = 'Converted' | 'Opened' | 'Not yet';

export interface CampaignConversionMetrics {
  conversionCount: number;
  orderCount: number;
  estimateCount: number;
  gmv: number;
  orderGmv: number;
  estimateGmv: number;
  convertingBuyerIds: Set<string>;
  conversionsByBuyer: Map<string, number>;
  spendByBuyer: Map<string, number>;
  lastConversionAtByBuyer: Map<string, string | null>;
  attributedGmvByOrderId: Map<string, number>;
  attributedGmvByEstimateId: Map<string, number>;
}

export interface CampaignViewMetrics {
  totalViews: number;
  uniqueViewers: number;
  lastOpenedAtByBuyer: Map<string, string>;
}

export interface CampaignAttributedMetricsOptions {
  includeOrders?: boolean;
  includeEstimates?: boolean;
}

export function isEligibleCampaignOrder(order: Pick<CampaignOrderRow, 'status'>): boolean {
  return order.status !== 'cancelled';
}

export function isEligibleCampaignEstimate(
  estimate: Pick<CampaignEstimateRow, 'status' | 'converted_to_order_id'>,
): boolean {
  return estimate.status !== 'pending' && estimate.status !== 'void' && estimate.converted_to_order_id == null;
}

export function lineItemAttributedAmount(item: CampaignLineItemRow): number {
  const qty = Number(item.qty ?? 0);
  return Number(item.line_total ?? qty * Number(item.unit_price ?? 0));
}

export function sumAttributedLineItems(items: CampaignLineItemRow[]): number {
  return items.reduce((sum, item) => sum + lineItemAttributedAmount(item), 0);
}

export function groupLineItemsByParent<T extends CampaignLineItemRow>(
  items: Array<T & { parent_id: string }>,
): Map<string, CampaignLineItemRow[]> {
  const byParent = new Map<string, CampaignLineItemRow[]>();
  for (const item of items) {
    const current = byParent.get(item.parent_id) ?? [];
    current.push(item);
    byParent.set(item.parent_id, current);
  }
  return byParent;
}

export function computeCampaignViewMetrics(rows: CampaignViewRow[]): CampaignViewMetrics {
  const lastOpenedAtByBuyer = new Map<string, string>();
  for (const row of rows) {
    const existing = lastOpenedAtByBuyer.get(row.buyer_id);
    if (!existing || new Date(row.viewed_at).getTime() > new Date(existing).getTime()) {
      lastOpenedAtByBuyer.set(row.buyer_id, row.viewed_at);
    }
  }

  return {
    totalViews: rows.length,
    uniqueViewers: lastOpenedAtByBuyer.size,
    lastOpenedAtByBuyer,
  };
}

export function computeCampaignAttributedMetrics(
  orders: CampaignOrderRow[],
  estimates: CampaignEstimateRow[],
  orderItemsByParent: Map<string, CampaignLineItemRow[]>,
  estimateItemsByParent: Map<string, CampaignLineItemRow[]>,
  options: CampaignAttributedMetricsOptions = {},
): CampaignConversionMetrics {
  const includeOrders = options.includeOrders !== false;
  const includeEstimates = options.includeEstimates !== false;

  const eligibleOrders = includeOrders ? orders.filter(isEligibleCampaignOrder) : [];
  const eligibleEstimates = includeEstimates ? estimates.filter(isEligibleCampaignEstimate) : [];

  const convertingBuyerIds = new Set<string>();
  const conversionsByBuyer = new Map<string, number>();
  const spendByBuyer = new Map<string, number>();
  const lastConversionAtByBuyer = new Map<string, string | null>();
  const attributedGmvByOrderId = new Map<string, number>();
  const attributedGmvByEstimateId = new Map<string, number>();

  let orderGmv = 0;
  let estimateGmv = 0;
  let orderCount = 0;
  let estimateCount = 0;

  const recordConversion = (buyerId: string, amount: number, at: string | null) => {
    convertingBuyerIds.add(buyerId);
    conversionsByBuyer.set(buyerId, (conversionsByBuyer.get(buyerId) ?? 0) + 1);
    spendByBuyer.set(buyerId, (spendByBuyer.get(buyerId) ?? 0) + amount);

    const existing = lastConversionAtByBuyer.get(buyerId);
    if (!existing || (at && new Date(at).getTime() > new Date(existing).getTime())) {
      lastConversionAtByBuyer.set(buyerId, at);
    }
  };

  for (const order of eligibleOrders) {
    const amount = sumAttributedLineItems(orderItemsByParent.get(order.id) ?? []);
    attributedGmvByOrderId.set(order.id, amount);
    if (amount <= 0) continue;

    orderGmv += amount;
    orderCount += 1;
    recordConversion(order.buyer_id, amount, order.placed_at ?? order.created_at ?? null);
  }

  for (const estimate of eligibleEstimates) {
    const amount = sumAttributedLineItems(estimateItemsByParent.get(estimate.id) ?? []);
    attributedGmvByEstimateId.set(estimate.id, amount);
    if (amount <= 0) continue;

    estimateGmv += amount;
    estimateCount += 1;
    recordConversion(estimate.buyer_id, amount, estimate.created_at ?? null);
  }

  return {
    conversionCount: orderCount + estimateCount,
    orderCount,
    estimateCount,
    gmv: orderGmv + estimateGmv,
    orderGmv,
    estimateGmv,
    convertingBuyerIds,
    conversionsByBuyer,
    spendByBuyer,
    lastConversionAtByBuyer,
    attributedGmvByOrderId,
    attributedGmvByEstimateId,
  };
}

/** @deprecated Prefer computeCampaignAttributedMetrics with line items for accurate mixed-cart GMV */
export function computeCampaignConversionMetrics(
  orders: CampaignOrderRow[],
  estimates: CampaignEstimateRow[],
  options: CampaignAttributedMetricsOptions = {},
): CampaignConversionMetrics {
  const includeOrders = options.includeOrders !== false;
  const includeEstimates = options.includeEstimates !== false;

  const eligibleOrders = includeOrders ? orders.filter(isEligibleCampaignOrder) : [];
  const eligibleEstimates = includeEstimates ? estimates.filter(isEligibleCampaignEstimate) : [];

  const orderItemsByParent = new Map<string, CampaignLineItemRow[]>();
  for (const order of eligibleOrders) {
    orderItemsByParent.set(order.id, [
      {
        tenant_product_id: 'header',
        qty: 1,
        line_total: Number(order.total_amount ?? 0),
        unit_price: Number(order.total_amount ?? 0),
      },
    ]);
  }

  const estimateItemsByParent = new Map<string, CampaignLineItemRow[]>();
  for (const estimate of eligibleEstimates) {
    estimateItemsByParent.set(estimate.id, [
      {
        tenant_product_id: 'header',
        qty: 1,
        line_total: Number(estimate.total_amount ?? 0),
        unit_price: Number(estimate.total_amount ?? 0),
      },
    ]);
  }

  return computeCampaignAttributedMetrics(
    orders,
    estimates,
    orderItemsByParent,
    estimateItemsByParent,
    options,
  );
}

export function buildCatalogAttributedMetrics(
  campaignId: string,
  campaignProductIds: Set<string>,
  orders: Array<CampaignOrderRow & { campaign_id?: string | null }>,
  estimates: Array<CampaignEstimateRow & { campaign_id?: string | null }>,
  orderItemsRaw: Array<{ order_id: string } & CampaignLineItemRow>,
  estimateItemsRaw: Array<{ estimate_id: string } & CampaignLineItemRow>,
  options: CampaignAttributedMetricsOptions = {},
): CampaignConversionMetrics {
  const campaignOrders = orders.filter((order) => order.campaign_id === campaignId);
  const campaignEstimates = estimates.filter((estimate) => estimate.campaign_id === campaignId);
  const orderIds = new Set(campaignOrders.map((order) => order.id));
  const eligibleEstimateIds = new Set(
    campaignEstimates.filter(isEligibleCampaignEstimate).map((estimate) => estimate.id),
  );

  const orderItems = orderItemsRaw
    .filter((item) => orderIds.has(item.order_id) && campaignProductIds.has(item.tenant_product_id))
    .map((item) => ({ ...item, parent_id: item.order_id }));

  const estimateItems = estimateItemsRaw
    .filter((item) => eligibleEstimateIds.has(item.estimate_id) && campaignProductIds.has(item.tenant_product_id))
    .map((item) => ({ ...item, parent_id: item.estimate_id }));

  return computeCampaignAttributedMetrics(
    campaignOrders,
    campaignEstimates,
    groupLineItemsByParent(orderItems),
    groupLineItemsByParent(estimateItems),
    options,
  );
}

export function getCampaignBuyerOpenedStatus(
  conversionCount: number,
  lastOpenedAt: string | null,
): CampaignBuyerOpenedStatus {
  if (conversionCount > 0) return 'Converted';
  if (lastOpenedAt) return 'Opened';
  return 'Not yet';
}

export function aggregateCampaignViewsByCampaign(rows: CampaignViewRow[]): Map<string, CampaignViewMetrics> {
  const byCampaign = new Map<string, CampaignViewRow[]>();
  for (const row of rows) {
    if (!byCampaign.has(row.campaign_id)) byCampaign.set(row.campaign_id, []);
    byCampaign.get(row.campaign_id)?.push(row);
  }

  const result = new Map<string, CampaignViewMetrics>();
  for (const [campaignId, campaignRows] of byCampaign) {
    result.set(campaignId, computeCampaignViewMetrics(campaignRows));
  }
  return result;
}

export interface CampaignItemMembershipWindow {
  valid_from: string;
  /** null/undefined = still active (open window) */
  deleted_at?: string | null;
}

/**
 * Point-in-time membership filter: keeps only line items whose product was actually part of
 * the campaign on the date its parent order/estimate was placed, per that product's
 * [valid_from, deleted_at) window(s) on app.campaign_items. A product removed from the
 * campaign after an order shipped still counts for that order; a product added after an
 * order shipped does not retroactively pick up that order's GMV.
 */
export function filterLineItemsByMembershipWindow<T extends CampaignLineItemRow & { parent_id: string }>(
  items: T[],
  parentDateByParentId: Map<string, string | null>,
  windowsByProduct: Map<string, CampaignItemMembershipWindow[]>,
): T[] {
  return items.filter((item) => {
    const parentDate = parentDateByParentId.get(item.parent_id);
    if (!parentDate) return false;
    const windows = windowsByProduct.get(item.tenant_product_id);
    if (!windows || windows.length === 0) return false;
    const parentTime = new Date(parentDate).getTime();
    return windows.some((w) => {
      const from = new Date(w.valid_from).getTime();
      const until = w.deleted_at ? new Date(w.deleted_at).getTime() : Infinity;
      return parentTime >= from && parentTime < until;
    });
  });
}

export function rollupSkuMetrics(
  orderItems: Array<CampaignLineItemRow & { parent_id: string }>,
  estimateItems: Array<CampaignLineItemRow & { parent_id: string }>,
  validOrderIds: Set<string>,
  validEstimateIds: Set<string>,
): Map<string, { units: number; gmv: number }> {
  const skuMetricsByProduct = new Map<string, { units: number; gmv: number }>();

  const addItem = (tenantProductId: string, qty: number, lineTotal: number) => {
    const current = skuMetricsByProduct.get(tenantProductId) ?? { units: 0, gmv: 0 };
    current.units += qty;
    current.gmv += lineTotal;
    skuMetricsByProduct.set(tenantProductId, current);
  };

  for (const item of orderItems) {
    if (!validOrderIds.has(item.parent_id)) continue;
    const qty = Number(item.qty ?? 0);
    addItem(item.tenant_product_id, qty, lineItemAttributedAmount(item));
  }

  for (const item of estimateItems) {
    if (!validEstimateIds.has(item.parent_id)) continue;
    const qty = Number(item.qty ?? 0);
    addItem(item.tenant_product_id, qty, lineItemAttributedAmount(item));
  }

  return skuMetricsByProduct;
}
