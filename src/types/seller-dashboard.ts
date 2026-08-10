import type { EntityAvatarHue, StatusTone } from '@/components/seller/layout';
import type { SellerLandingPeriodMeta } from '@/lib/seller-period';

export type SellerDashboardRole = 'seller_admin' | 'seller_assistant';
export type SellerDashboardDocKind = 'estimate' | 'sales_order' | 'invoice' | 'order' | 'catalog' | 'customer';
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

export interface SellerDashboardBusinessFlowMeta {
  primary_demand_kind?: 'orders' | 'estimates' | 'none';
  invoice_value_this_month?: number;
  invoice_count_this_month?: number;
  order_value_this_month?: number;
  order_count_this_month?: number;
  estimate_value_this_month?: number;
  estimate_count_this_month?: number;
  orders_enabled?: boolean;
  estimates_enabled?: boolean;
}

export interface SellerDashboardMixEntry {
  id: string;
  name: string;
  value: number;
}

export interface SellerDashboardLocationComparisonEntry {
  location_id: string;
  name: string;
  invoiced_sales_90d: number;
  open_primary_demand_value: number | null;
  overdue_amount: number;
}

export interface SellerDashboardSalesMixMeta {
  brands?: SellerDashboardMixEntry[];
  categories?: SellerDashboardMixEntry[];
  locations?: SellerDashboardLocationComparisonEntry[];
}

export interface SellerDashboardCustomerActivityMeta {
  purchasing_customers_90d?: number;
  repeat_customers_90d?: number;
  inactive_customers_90d?: number;
  overdue_customers_now?: number;
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

export interface SellerDashboardCalloutRow {
  id: string;
  initials: string;
  hue: EntityAvatarHue;
  name: string;
  reason: string;
  trailing: string;
  href?: string;
}

export interface SellerDashboardCalloutItem {
  id: string;
  kind: 'risk' | 'info' | 'opportunity';
  eyebrow: string;
  hint: string;
  rows: SellerDashboardCalloutRow[];
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

export interface SellerDashboardRecentActivityRow {
  id: string;
  kind: SellerDashboardDocKind;
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

export interface SellerAdminDashboardSection {
  metrics: SellerDashboardMetric[];
  callouts: SellerDashboardCalloutItem[];
  recent_activity: SellerDashboardRecentActivityRow[];
}

export interface SellerAssistantDashboardSection {
  metrics: SellerDashboardMetric[];
  callouts: SellerDashboardCalloutItem[];
  feeds: SellerDashboardFeed[];
}

export interface SellerDashboardResponse {
  role: SellerDashboardRole;
  period: SellerLandingPeriodMeta;
  tenant: SellerDashboardTenantSummary;
  portfolio?: MetricsV2DashboardPortfolio | null;
  admin?: SellerAdminDashboardSection;
  assistant?: SellerAssistantDashboardSection;
}
