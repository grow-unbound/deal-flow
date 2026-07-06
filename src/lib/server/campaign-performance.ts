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
}

export interface CampaignViewMetrics {
  totalViews: number;
  uniqueViewers: number;
  lastOpenedAtByBuyer: Map<string, string>;
}

export function isEligibleCampaignOrder(order: Pick<CampaignOrderRow, 'status'>): boolean {
  return order.status !== 'cancelled';
}

export function isEligibleCampaignEstimate(
  estimate: Pick<CampaignEstimateRow, 'status' | 'converted_to_order_id'>,
): boolean {
  return estimate.status !== 'pending' && estimate.status !== 'void' && estimate.converted_to_order_id == null;
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

export function computeCampaignConversionMetrics(
  orders: CampaignOrderRow[],
  estimates: CampaignEstimateRow[],
): CampaignConversionMetrics {
  const eligibleOrders = orders.filter(isEligibleCampaignOrder);
  const eligibleEstimates = estimates.filter(isEligibleCampaignEstimate);

  const convertingBuyerIds = new Set<string>();
  const conversionsByBuyer = new Map<string, number>();
  const spendByBuyer = new Map<string, number>();
  const lastConversionAtByBuyer = new Map<string, string | null>();

  let orderGmv = 0;
  let estimateGmv = 0;

  for (const order of eligibleOrders) {
    convertingBuyerIds.add(order.buyer_id);
    conversionsByBuyer.set(order.buyer_id, (conversionsByBuyer.get(order.buyer_id) ?? 0) + 1);
    const amount = Number(order.total_amount ?? 0);
    orderGmv += amount;
    spendByBuyer.set(order.buyer_id, (spendByBuyer.get(order.buyer_id) ?? 0) + amount);

    const at = order.placed_at ?? order.created_at ?? null;
    const existing = lastConversionAtByBuyer.get(order.buyer_id);
    if (!existing || (at && new Date(at).getTime() > new Date(existing).getTime())) {
      lastConversionAtByBuyer.set(order.buyer_id, at);
    }
  }

  for (const estimate of eligibleEstimates) {
    convertingBuyerIds.add(estimate.buyer_id);
    conversionsByBuyer.set(estimate.buyer_id, (conversionsByBuyer.get(estimate.buyer_id) ?? 0) + 1);
    const amount = Number(estimate.total_amount ?? 0);
    estimateGmv += amount;
    spendByBuyer.set(estimate.buyer_id, (spendByBuyer.get(estimate.buyer_id) ?? 0) + amount);

    const at = estimate.created_at ?? null;
    const existing = lastConversionAtByBuyer.get(estimate.buyer_id);
    if (!existing || (at && new Date(at).getTime() > new Date(existing).getTime())) {
      lastConversionAtByBuyer.set(estimate.buyer_id, at);
    }
  }

  return {
    conversionCount: eligibleOrders.length + eligibleEstimates.length,
    orderCount: eligibleOrders.length,
    estimateCount: eligibleEstimates.length,
    gmv: orderGmv + estimateGmv,
    orderGmv,
    estimateGmv,
    convertingBuyerIds,
    conversionsByBuyer,
    spendByBuyer,
    lastConversionAtByBuyer,
  };
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
    addItem(item.tenant_product_id, qty, Number(item.line_total ?? qty * Number(item.unit_price ?? 0)));
  }

  for (const item of estimateItems) {
    if (!validEstimateIds.has(item.parent_id)) continue;
    const qty = Number(item.qty ?? 0);
    addItem(item.tenant_product_id, qty, Number(item.line_total ?? qty * Number(item.unit_price ?? 0)));
  }

  return skuMetricsByProduct;
}
