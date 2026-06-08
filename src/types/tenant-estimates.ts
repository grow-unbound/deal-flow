import type { SellerLandingPeriodMeta } from '@/lib/seller-period';

export type EstimateDbStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'converted'
  | 'invoiced'
  | 'void'
  | 'pending';

export type EstimateStatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export type EstimateAvatarHue = 'teal' | 'ember' | 'cream';

export type EstimateFilterChip =
  | 'All'
  | 'Draft'
  | 'Sent'
  | 'Accepted'
  | 'Converted'
  | 'Declined'
  | 'Expired';

export interface EstimateLandingRow {
  id: string;
  estimate_number: string;
  buyer_id: string;
  buyer_name: string;
  buyer_city: string | null;
  buyer_state: string | null;
  buyer_initials: string;
  buyer_hue: EstimateAvatarHue;
  source: 'buyer_app' | 'seller';
  source_label: string;
  source_detail: string;
  catalog_name: string | null;
  created_by_label: string | null;
  items_count: number;
  total_amount: number;
  expires_at: string | null;
  created_at: string;
  accepted_at: string | null;
  sent_at: string | null;
  status: {
    value: EstimateDbStatus;
    label: string;
    tone: EstimateStatusTone;
    filter_chip: EstimateFilterChip;
  };
}

export interface EstimatesKpis {
  total_estimates_this_period: number;
  total_estimates_prev_period: number;
  total_estimates_growth_pct: number;
  total_gmv_this_period: number;
  total_gmv_prev_period: number;
  aov: number;
  open_estimates_this_period: number;
  open_total: number;
  open_drafts: number;
  open_sent: number;
  open_accepted: number;
  ready_to_convert: number;
  expiring_soon: number;
  converted_this_period: number;
  open_created_this_period: number;
  buyer_app_created_this_period: number;
}

export interface EstimateCalloutRow {
  id: string;
  estimate_number: string;
  buyer_name: string;
  buyer_initials: string;
  buyer_hue: EstimateAvatarHue;
  items_count: number;
  total_amount: number;
  sent_at: string | null;
  expires_at: string | null;
  status: { label: string; tone: EstimateStatusTone };
}

export interface EstimatesTodaysRead {
  needs_follow_up: EstimateCalloutRow[];
  ready_to_convert: EstimateCalloutRow[];
  expiring_soon: EstimateCalloutRow[];
}

export interface TenantEstimatesResponse {
  period: SellerLandingPeriodMeta;
  kpis: EstimatesKpis;
  todays_read: EstimatesTodaysRead;
  estimates: EstimateLandingRow[];
}
