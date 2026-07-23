export { cn } from '@/lib/cn';
export type { NumberFormatKind, NumberFormatOptions } from '@/lib/number-format';
export { formatNumberInput, formatNumberValue, parseNumberInput, formatAsOfLabel } from '@/lib/number-format';

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function truncate(str: string, maxLength: number): string {
  return str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
}

export type PriceListStatus = 'active' | 'draft' | 'expired';

export function getPriceListStatus(pl: {
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}): PriceListStatus {
  const now = new Date();
  if (pl.valid_to && new Date(pl.valid_to) <= now) return 'expired';
  if (!pl.is_active) return 'draft';
  if (pl.valid_from && new Date(pl.valid_from) > now) return 'draft';
  return 'active';
}
