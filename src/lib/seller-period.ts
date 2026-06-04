export type SellerLandingPeriod = 'month' | 'quarter' | 'year';

export interface SellerLandingPeriodOption {
  value: SellerLandingPeriod;
  label: string;
}

export interface SellerLandingPeriodMeta {
  selected: SellerLandingPeriod;
  timezone: string;
  current_start: string;
  current_end_exclusive: string;
  previous_start: string;
  previous_end_exclusive: string;
  elapsed_days: number;
}

export const DEFAULT_SELLER_LANDING_PERIOD: SellerLandingPeriod = 'month';

export const SELLER_LANDING_PERIOD_OPTIONS: SellerLandingPeriodOption[] = [
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
];

export function isSellerLandingPeriod(value: string | null | undefined): value is SellerLandingPeriod {
  return value === 'month' || value === 'quarter' || value === 'year';
}

export function parseSellerLandingPeriod(value: string | null | undefined): SellerLandingPeriod {
  return isSellerLandingPeriod(value) ? value : DEFAULT_SELLER_LANDING_PERIOD;
}

export function sellerLandingPeriodLabel(period: SellerLandingPeriod): string {
  return SELLER_LANDING_PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'This Month';
}

export function sellerLandingPeriodLowerLabel(period: SellerLandingPeriod): string {
  return sellerLandingPeriodLabel(period).toLowerCase();
}

export function sellerLandingMetricSuffix(period: SellerLandingPeriod): 'MTD' | 'QTD' | 'YTD' {
  if (period === 'quarter') return 'QTD';
  if (period === 'year') return 'YTD';
  return 'MTD';
}
