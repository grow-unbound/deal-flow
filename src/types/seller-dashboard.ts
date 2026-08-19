import type { StatusTone } from '@/components/seller/layout';
import type { SellerLandingPeriodMeta } from '@/lib/seller-period';

export type SellerDashboardRole = 'seller_admin' | 'seller_assistant';
export type SellerDashboardFeedKind = 'estimates' | 'sales_orders' | 'invoices';

export interface SellerDashboardTenantSummary {
  id: string;
  business_name: string;
  subdomain: string | null;
  plan: string | null;
  location_names: string[];
}

export interface MetricsV2PortfolioItem {
  id: string;
  label: string;
  time_basis: string;
  feasibility: 'READY' | 'REWORK' | 'ON-OPEN' | 'CONDITIONAL';
  available: boolean;
  unavailable_reason?: string | null;
  value?: number | null;
  count?: number | null;
  unit?: string | null;
  meta?: Record<string, unknown>;
}

/** v4: app.get_seller_dashboard_business_flow_v4 -- trailing 6 months, Sales
 *  + Demand series in one payload (metrics_tenant_period_summary, gap-filled
 *  to 6 months server-side). Toggle between series is a client-side render
 *  switch, no separate fetch. */
export interface SellerDashboardBusinessFlowMonthV4 {
  period_start: string;
  invoice_value: number;
  invoice_count: number;
  demand_value: number;
  demand_count: number;
}

export interface SellerDashboardBusinessFlowV4 {
  primary_demand_kind: 'orders' | 'estimates' | 'none';
  months: SellerDashboardBusinessFlowMonthV4[];
}

/** v4: app.get_seller_dashboard_customer_activity_v4 -- current quarter-to-date. */
export interface SellerDashboardCustomerActivityV4 {
  purchasing: number;
  repeat: number;
  inactive: number;
  overdue: number;
}

/** v4: app.get_seller_dashboard_sales_mix_v4 -- one dimension per call
 *  (Brand XOR Category), current + prior month values per item. */
export interface SellerDashboardSalesMixItemV4 {
  id: string;
  name: string;
  current_value: number;
  prior_value: number;
}

export type SellerDashboardSalesMixDimension = 'brands' | 'categories';

export interface SellerDashboardSalesMixV4 {
  items: SellerDashboardSalesMixItemV4[];
}

/** v4: app.get_seller_dashboard_location_performance_v4 -- small-multiples
 *  source, 3 values per location (sales / overdue / open demand). */
export interface SellerDashboardLocationPerformanceEntryV4 {
  location_id: string;
  name: string;
  sales_value: number;
  overdue_amount: number;
  open_demand_value: number;
}

export interface SellerDashboardLocationPerformanceV4 {
  locations: SellerDashboardLocationPerformanceEntryV4[];
}

export interface MetricsV2DashboardPortfolio {
  as_of: string;
  commercial_horizon_days: number;
  table_period: null;
  primary_demand_kind: 'orders' | 'estimates' | 'none';
  calculation_version: number;
  source_watermark: string | null;
  freshness: Record<string, unknown>;
  availability: Record<string, unknown>;
  metrics: MetricsV2PortfolioItem[];
  actions: MetricsV2PortfolioItem[];
  explore: MetricsV2PortfolioItem[];
}

export interface SellerDashboardMetric {
  label: string;
  value: number;
  sub?: string;
  tone?: 'accent' | 'warn';
  href?: string;
}

export interface SellerDashboardKpiCardV4 {
  id: string;
  value: number;
  entity_count?: number;
  document_count?: number | null;
  secondary_value?: number | null;
  time_basis?: string;
  filter_preset?: Record<string, unknown>;
}

export interface SellerDashboardMetricsV4 {
  page_key: string;
  period: {
    period_key: string;
    grain: string;
    period_start: string;
    period_end_exclusive: string;
    label?: string;
  };
  computed_at: string | null;
  source_watermark: string | null;
  cards: SellerDashboardKpiCardV4[];
}

export interface SellerDashboardFeedRow {
  id: string;
  href: string;
  document_number: string;
  customer_name: string;
  status: {
    label: string;
    tone: StatusTone;
  };
  amount: number;
  updated_at: string;
}

export interface SellerDashboardFeed {
  id: SellerDashboardFeedKind;
  title: string;
  href: string;
  empty_label: string;
  rows: SellerDashboardFeedRow[];
}

/** Admin section carries no data of its own -- the 4 explore cards
 *  (Business flow, Customer activity, Sales mix, Location performance) are
 *  each sourced from their own v4 hook, and the old metrics/callouts/
 *  recent-activity fields here were confirmed unread by the frontend and
 *  removed. Kept as a truthy marker so `dashboard.admin` still distinguishes
 *  the seller_admin response shape from the seller_assistant one. */
export type SellerAdminDashboardSection = Record<string, never>;

export interface SellerAssistantDashboardSection {
  metrics: SellerDashboardMetric[];
  feeds: SellerDashboardFeed[];
}

export interface SellerDashboardResponse {
  role: SellerDashboardRole;
  period: SellerLandingPeriodMeta;
  tenant: SellerDashboardTenantSummary;
  admin?: SellerAdminDashboardSection;
  assistant?: SellerAssistantDashboardSection;
}
