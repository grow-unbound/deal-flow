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
  delta?: number;
  delta_label?: string;
  sub?: string;
  tone?: 'accent' | 'warn';
  href?: string;
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

export interface SellerDashboardBrandRow {
  id: string;
  initials: string;
  name: string;
  pct: number;
  trend_label: string;
  hue: EntityAvatarHue;
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
  top_brands: SellerDashboardBrandRow[];
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
