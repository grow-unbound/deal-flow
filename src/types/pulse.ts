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
  source: 'app.get_landing_metrics_v4' | 'app.get_buyer_app_dashboard_v4';
  computed_at: string | null;
  source_watermark: string | null;
  freshness_label: string | null;
  primary_demand_kind: 'orders' | 'estimates' | 'none';
  cards: PulseContributionCard[];
  empty_opportunity?: PulseOpportunityGroup | null;
}

export interface PulseOpportunityPreview {
  buyer_id: string;
  name: string;
  initials: string;
  evidence_value?: number | null;
  evidence_label?: string | null;
  href: string;
}

export interface PulseOpportunityGroup {
  id:
    | 'valuable_assisted_customers_without_access'
    | 'access_enabled_but_never_used'
    | 'used_app_but_no_demand'
    | 'previously_submitted_app_demand_now_inactive';
  title: string;
  description: string;
  count: number;
  time_basis: string;
  evidence: string;
  action_label: string;
  href: string;
  previews: PulseOpportunityPreview[];
}

export interface PulseOpportunitiesResponse {
  source: 'app.get_buyer_app_dashboard_v4';
  computed_at: string | null;
  source_watermark: string | null;
  freshness_label: string | null;
  groups: PulseOpportunityGroup[];
}
