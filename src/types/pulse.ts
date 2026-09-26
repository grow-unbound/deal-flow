export interface PulseContributionCard {
  id: 'yukti_access_enabled' | 'demand_captured' | 'invoiced_from_captured_demand' | 'active_yukti_buyers' | 'repeat_yukti_buyers';
  label: string;
  value: number;
  value_kind: 'currency' | 'count';
  document_count?: number | null;
  buyer_count?: number | null;
  share_pct?: number | null;
  time_basis: string;
  evidence: string;
}

export interface PulseContributionResponse {
  source: 'app.get_landing_metrics_v4';
  computed_at: string | null;
  source_watermark: string | null;
  freshness_label: string | null;
  primary_demand_kind: 'orders' | 'estimates' | 'none';
  cards: PulseContributionCard[];
}

export interface PulseOpportunityPreview {
  buyer_id: string;
  name: string;
  initials: string;
  invoice_value_qtd?: number | null;
  invoice_count_qtd?: number | null;
  /** Dormancy opportunity: last invoice day (YYYY-MM-DD, IST), whole days since, and trailing-12-month value. */
  last_invoice_date?: string | null;
  days_since_last_invoice?: number | null;
  value_12m?: number | null;
  supporting_text?: string | null;
  href: string;
}

export interface PulseOpportunityGroup {
  id:
    | 'valuable_assisted_customers_without_access'
    | 'dormant_customers_90d';
  title: string;
  description: string;
  count: number;
  time_basis: string;
  evidence: string;
  action_label: string;
  action_href: string;
  previews: PulseOpportunityPreview[];
}

export interface PulseOpportunityBuyerPage {
  group: Pick<PulseOpportunityGroup, 'id' | 'title' | 'description' | 'count' | 'evidence' | 'action_label' | 'action_href'>;
  rows: PulseOpportunityPreview[];
  nextCursor: string | null;
  total: number;
}

export interface PulseOpportunitiesResponse {
  source: 'app.metrics_buyer_period_summary';
  computed_at: string | null;
  source_watermark: string | null;
  freshness_label: string | null;
  groups: PulseOpportunityGroup[];
}

export type PulseDemandSignalKind = 'missing_assortment' | 'conversion_gaps' | 'stock_mismatch';

export interface PulseDemandSignalRow {
  id: string;
  label: string;
  count: number;
  unique_count: number;
  last_seen_at: string | null;
  source_channel: 'storefront';
  tenant_product_id?: string | null;
  product_name?: string | null;
  stock_state?: 'available' | 'limited' | 'out_of_stock' | null;
}

export interface PulseDemandSignalsResponse {
  page_key: 'pulse_demand_signals';
  missing_assortment: PulseDemandSignalRow[];
  conversion_gaps: PulseDemandSignalRow[];
  stock_mismatch: PulseDemandSignalRow[];
  signal_counts: Record<PulseDemandSignalKind, number>;
  funnel_counts: {
    searches: number;
    zero_result_searches: number;
    product_views: number;
    cart_adds: number;
  };
  query_window: {
    started_at: string;
    ended_at: string;
  };
  computed_at: string | null;
  source_watermark: string | null;
  stale: boolean;
}
