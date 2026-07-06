import { describe, expect, it } from 'vitest';

import {
  computeCampaignConversionMetrics,
  computeCampaignViewMetrics,
  getCampaignBuyerOpenedStatus,
  isEligibleCampaignEstimate,
  isEligibleCampaignOrder,
  rollupSkuMetrics,
} from '@/lib/server/campaign-performance';

describe('campaign-performance', () => {
  it('dedupes estimate converted to order from conversion count', () => {
    const metrics = computeCampaignConversionMetrics(
      [
        {
          id: 'o1',
          buyer_id: 'b1',
          total_amount: 1000,
          placed_at: '2026-07-01T10:00:00Z',
          status: 'received',
          created_at: '2026-07-01T10:00:00Z',
        },
      ],
      [
        {
          id: 'e1',
          buyer_id: 'b1',
          total_amount: 500,
          status: 'accepted',
          converted_to_order_id: 'o1',
          created_at: '2026-06-30T10:00:00Z',
        },
        {
          id: 'e2',
          buyer_id: 'b2',
          total_amount: 200,
          status: 'accepted',
          converted_to_order_id: null,
          created_at: '2026-07-02T10:00:00Z',
        },
      ],
    );

    expect(metrics.conversionCount).toBe(2);
    expect(metrics.orderCount).toBe(1);
    expect(metrics.estimateCount).toBe(1);
    expect(metrics.gmv).toBe(1200);
    expect(metrics.convertingBuyerIds.size).toBe(2);
  });

  it('counts unique viewers from campaign view rows', () => {
    const metrics = computeCampaignViewMetrics([
      { buyer_id: 'b1', campaign_id: 'c1', viewed_at: '2026-07-01T08:00:00Z' },
      { buyer_id: 'b1', campaign_id: 'c1', viewed_at: '2026-07-02T08:00:00Z', view_date: '2026-07-02' },
      { buyer_id: 'b2', campaign_id: 'c1', viewed_at: '2026-07-01T09:00:00Z' },
    ]);

    expect(metrics.totalViews).toBe(3);
    expect(metrics.uniqueViewers).toBe(2);
    expect(metrics.lastOpenedAtByBuyer.get('b1')).toBe('2026-07-02T08:00:00Z');
  });

  it('maps buyer opened status', () => {
    expect(getCampaignBuyerOpenedStatus(1, '2026-07-01')).toBe('Converted');
    expect(getCampaignBuyerOpenedStatus(0, '2026-07-01')).toBe('Opened');
    expect(getCampaignBuyerOpenedStatus(0, null)).toBe('Not yet');
  });

  it('filters eligible orders and estimates', () => {
    expect(isEligibleCampaignOrder({ status: 'cancelled' })).toBe(false);
    expect(isEligibleCampaignOrder({ status: 'received' })).toBe(true);
    expect(isEligibleCampaignEstimate({ status: 'pending', converted_to_order_id: null })).toBe(false);
    expect(isEligibleCampaignEstimate({ status: 'accepted', converted_to_order_id: 'o1' })).toBe(false);
    expect(isEligibleCampaignEstimate({ status: 'accepted', converted_to_order_id: null })).toBe(true);
  });

  it('rolls up sku metrics across orders and estimates', () => {
    const rollup = rollupSkuMetrics(
      [{ parent_id: 'o1', tenant_product_id: 'p1', qty: 2, line_total: 200, unit_price: 100 }],
      [{ parent_id: 'e1', tenant_product_id: 'p1', qty: 1, line_total: 90, unit_price: 90 }],
      new Set(['o1']),
      new Set(['e1']),
    );

    expect(rollup.get('p1')).toEqual({ units: 3, gmv: 290 });
  });
});
