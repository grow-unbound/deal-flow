import { describe, expect, it } from 'vitest';

import { landingMetricsToPulseContribution, portfolioToPulseContribution, portfolioToPulseOpportunities } from '@/lib/server/pulse-core';
import type { MetricsV2DashboardPortfolio } from '@/types/seller-dashboard';

const portfolio: MetricsV2DashboardPortfolio = {
  as_of: '2026-09-22T04:00:00.000Z',
  commercial_horizon_days: 90,
  table_period: null,
  primary_demand_kind: 'orders',
  calculation_version: 1,
  source_watermark: '2026-09-22T03:45:00.000Z',
  freshness: {},
  availability: {},
  metrics: [
    {
      id: 'customers_with_access',
      label: 'Customers with Buyer App access',
      time_basis: 'NOW',
      feasibility: 'READY',
      available: true,
      count: 27,
      unit: 'count',
    },
    {
      id: 'customers_submitting_app_demand',
      label: 'Customers submitting app demand',
      time_basis: 'QTD',
      feasibility: 'READY',
      available: true,
      count: 6,
      unit: 'count',
    },
    {
      id: 'app_sourced_demand_value_share',
      label: 'App-sourced demand value + share',
      time_basis: 'QTD',
      feasibility: 'READY',
      available: true,
      value: 18,
      count: 9,
      unit: 'percent',
      meta: {
        app_demand_value_90d: 840000,
        total_demand_value_90d: 4200000,
      },
    },
    {
      id: 'app_sourced_invoiced_sales_share',
      label: 'App-sourced invoiced sales + share',
      time_basis: 'QTD',
      feasibility: 'READY',
      available: true,
      value: 12,
      unit: 'percent',
      meta: {
        app_invoiced_sales_90d: 510000,
        total_invoiced_sales_90d: 4250000,
      },
    },
    {
      id: 'repeat_app_customers',
      label: 'Repeat app customers',
      time_basis: 'QTD',
      feasibility: 'READY',
      available: true,
      count: 3,
      unit: 'count',
    },
  ],
  actions: [
    {
      id: 'valuable_assisted_customers_without_access',
      label: 'Valuable assisted customers without app access',
      time_basis: 'NOW + QTD',
      feasibility: 'READY',
      available: true,
      count: 12,
      unit: 'count',
      meta: {
        rows: [
          { buyer_id: 'buyer-1', name: 'Alpha Retail', invoice_value_qtd: 410000, invoice_count_qtd: 8 },
          { buyer_id: 'buyer-2', name: 'Bravo Stores', invoice_value_qtd: 250000, invoice_count_qtd: 5 },
          { buyer_id: 'buyer-3', name: 'City Cameras', invoice_value_qtd: 180000, invoice_count_qtd: 4 },
          { buyer_id: 'buyer-4', name: 'Delta Security', invoice_value_qtd: 120000, invoice_count_qtd: 3 },
          { buyer_id: 'buyer-7', name: 'Echo Security', invoice_value_qtd: 90000, invoice_count_qtd: 2 },
          { buyer_id: 'buyer-8', name: 'Frame Security', invoice_value_qtd: 70000, invoice_count_qtd: 1 },
        ],
      },
    },
    {
      id: 'app_demand_needing_operational_action',
      label: 'App demand needing operational action',
      time_basis: 'NOW',
      feasibility: 'READY',
      available: true,
      count: 99,
      unit: 'count',
      meta: { rows: [{ buyer_id: 'buyer-hidden', name: 'Should Not Render' }] },
    },
    {
      id: 'access_enabled_but_never_used',
      label: 'Access enabled but never used',
      time_basis: 'NOW',
      feasibility: 'READY',
      available: true,
      count: 2,
      unit: 'count',
      meta: {
        rows: [
          { buyer_id: 'buyer-5', name: 'Enabled Retail', invoice_value_qtd: 320000, invoice_count_qtd: 6 },
        ],
      },
    },
    {
      id: 'used_app_but_no_demand',
      label: 'Used the app but submitted no demand',
      time_basis: 'NOW + 90D',
      feasibility: 'READY',
      available: true,
      count: 1,
      unit: 'count',
      meta: {
        rows: [
          { buyer_id: 'buyer-6', name: 'Browsing Retail', invoice_value_qtd: 220000, invoice_count_qtd: 4 },
        ],
      },
    },
  ],
  explore: [],
};

describe('Pulse core mapping', () => {
  it('maps seller-admin contribution from buyer-app landing metrics without access-enabled filler', () => {
    const response = landingMetricsToPulseContribution({
      page_key: 'buyer_app',
      period: {
        period_key: 'this_quarter',
        grain: 'quarter',
        period_start: '2026-07-01',
        period_end_exclusive: '2026-10-01',
        label: 'This Quarter',
      },
      computed_at: '2026-09-22T04:00:00.000Z',
      source_watermark: '2026-09-22T03:45:00.000Z',
      cards: [
        { id: 'customers_with_access', value: 272, entity_count: 272, secondary_value: 11894, time_basis: 'now' },
        { id: 'app_sourced_demand_qtd', value: 840000, entity_count: 6, document_count: 9, time_basis: 'quarter' },
        { id: 'app_sourced_invoiced_sales_qtd', value: 510000, entity_count: 4, document_count: 5, secondary_value: 4250000, time_basis: 'quarter' },
      ],
    });

    expect(response.source).toBe('app.get_landing_metrics_v4');
    expect(response.cards.map((card) => card.id)).toEqual([
      'yukti_access_enabled',
      'demand_captured',
      'invoiced_from_captured_demand',
      'active_yukti_buyers',
    ]);
    expect(response.cards[0]).toEqual(expect.objectContaining({
      label: 'Customers with Yukti access',
      value: 272,
    }));
  });

  it('maps contribution cards from existing buyer-app v4 aggregate portfolio with the buyer-app footprint card', () => {
    const response = portfolioToPulseContribution(portfolio);

    expect(response.source).toBe('app.get_buyer_app_dashboard_v4');
    expect(response.freshness_label).toBe('2026-09-22T03:45:00.000Z');
    expect(response.cards.map((card) => card.id)).toEqual([
      'yukti_access_enabled',
      'demand_captured',
      'invoiced_from_captured_demand',
      'active_yukti_buyers',
      'repeat_yukti_buyers',
    ]);
    expect(response.cards[1]).toEqual(expect.objectContaining({
      value: 840000,
      document_count: 9,
      buyer_count: 6,
      time_basis: 'QTD',
    }));
  });

  it('maps no more than three allowed opportunity groups and excludes Inbox-owned operational demand', () => {
    const response = portfolioToPulseOpportunities(portfolio);

    expect(response.groups).toHaveLength(3);
    expect(response.groups[0].id).toBe('valuable_assisted_customers_without_access');
    expect(response.groups[0].previews).toHaveLength(5);
    expect(response.groups[0].previews[0]).toEqual(expect.objectContaining({
      supporting_text: '₹4,10,000 · 8 invoices',
    }));
    expect(response.groups[1]).toEqual(expect.objectContaining({
      id: 'access_enabled_but_never_used',
      description: 'Customers have access enabled but still do business outside Yukti.',
    }));
    expect(response.groups[1].previews[0]).toEqual(expect.objectContaining({
      invoice_value_qtd: 320000,
      invoice_count_qtd: 6,
      supporting_text: '₹3,20,000 · 6 invoices',
    }));
    expect(response.groups[2]).toEqual(expect.objectContaining({
      id: 'used_app_but_no_demand',
      title: 'Follow up with browsing customers without demand',
    }));
    expect(response.groups[2].previews[0]).toEqual(expect.objectContaining({
      invoice_value_qtd: 220000,
      invoice_count_qtd: 4,
      supporting_text: '₹2,20,000 · 4 invoices',
    }));
    expect(JSON.stringify(response)).not.toContain('app_demand_needing_operational_action');
    expect(JSON.stringify(response)).not.toContain('Should Not Render');
  });
});
