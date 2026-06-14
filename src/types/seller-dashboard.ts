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
  admin?: SellerAdminDashboardSection;
  assistant?: SellerAssistantDashboardSection;
}
