export type SellerLandingPeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'last90';

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
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
];

export function isSellerLandingPeriod(value: string | null | undefined): value is SellerLandingPeriod {
  return value === 'today' || value === 'week' || value === 'month' || value === 'quarter' || value === 'year' || value === 'last90';
}

export function parseSellerLandingPeriod(value: string | null | undefined): SellerLandingPeriod {
  return isSellerLandingPeriod(value) ? value : DEFAULT_SELLER_LANDING_PERIOD;
}

export function getSellerLandingInitialData<T extends { period?: SellerLandingPeriodMeta }>(
  period: SellerLandingPeriod,
  initialData?: T | null,
): T | undefined {
  if (!initialData?.period) return undefined;
  return initialData.period.selected === period ? initialData : undefined;
}

export function sellerLandingPeriodLabel(period: SellerLandingPeriod): string {
  if (period === 'last90') return 'Trailing 90 days';
  return SELLER_LANDING_PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'This Month';
}

export function sellerLandingPeriodLowerLabel(period: SellerLandingPeriod): string {
  if (period === 'today') return 'today';
  if (period === 'last90') return 'in the last 90 days';
  return sellerLandingPeriodLabel(period).toLowerCase();
}

export function sellerLandingMetricSuffix(period: SellerLandingPeriod): 'TODAY' | 'WTD' | 'MTD' | 'QTD' | 'YTD' | '90D' {
  if (period === 'today') return 'TODAY';
  if (period === 'week') return 'WTD';
  if (period === 'quarter') return 'QTD';
  if (period === 'year') return 'YTD';
  if (period === 'last90') return '90D';
  return 'MTD';
}
