import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Tell tailwind-merge which text-* classes are font-sizes (not colors).
// Without this, custom font-size tokens like `text-body-sm` conflict with
// color tokens like `text-cream-50`, and tailwind-merge drops the color.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', 'display-xl', 'display-lg', 'display-md', 'display-sm', 'h1', 'h2', 'h3', 'h4', 'body', 'body-sm', 'caption', 'eyebrow'] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatInrInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const [intPartRaw, decPartRaw] = cleaned.split('.');
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '') || '0';
  const formattedInt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(intPart));
  if (decPartRaw == null) return formattedInt;
  return `${formattedInt}.${decPartRaw.slice(0, 2)}`;
}

export function parseInrInput(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCompactIndianNumber(value: number, fractionDigits = 0): string {
  const abs = Math.abs(value);
  if (abs < 10000) {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
  }

  const units = [
    { threshold: 10000000, suffix: 'Cr' },
    { threshold: 100000, suffix: 'L' },
    { threshold: 1000, suffix: 'K' },
  ];

  for (const unit of units) {
    if (abs >= unit.threshold) {
      const scaled = value / unit.threshold;
      if (fractionDigits <= 0) {
        return `${Math.round(scaled)}${unit.suffix}`;
      }
      return `${scaled.toFixed(fractionDigits).replace(/\.?0+$/, '')}${unit.suffix}`;
    }
  }

  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
}

export interface CurrencyFormatOptions {
  currency?: string;
  fractionDigits?: number;
  compactFractionDigits?: number;
  compactThreshold?: number;
}

export function formatAmountInr(
  value: number | null | undefined,
  options: CurrencyFormatOptions = {},
): string {
  const amount = Number(value ?? 0);
  const compactThreshold = options.compactThreshold ?? 10000;
  const fractionDigits = options.fractionDigits ?? 0;
  const compactFractionDigits = options.compactFractionDigits ?? fractionDigits;
  const currency = options.currency ?? 'INR';
  if (Math.abs(amount) < compactThreshold) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  }
  return `₹${formatCompactIndianNumber(amount, compactFractionDigits)}`;
}

export function formatCurrency(amount: number, currencyOrOptions: string | CurrencyFormatOptions = 'INR'): string {
  if (typeof currencyOrOptions === 'string') {
    return formatAmountInr(amount, { currency: currencyOrOptions });
  }
  return formatAmountInr(amount, currencyOrOptions);
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatMetricValue(label: string, value: number): string {
  const currencyMetric = /(gmv|sales|demand|value|spend|revenue|receivables|invoice|outstanding|due|credit|aov|amount|order value|estimate value)/i.test(label);
  return currencyMetric ? formatCurrency(value, { compactFractionDigits: 2 }) : formatNumber(value);
}

export function formatInr(amount: number): string {
  return formatCurrency(amount, 'INR');
}

export function formatSalesInr(value: number, fractionDigits = 0): string {
  return formatCurrency(value, { fractionDigits: 0, compactFractionDigits: fractionDigits });
}

export function formatCompactInr(value: number, fractionDigits = 0): string {
  return formatCurrency(value, { fractionDigits: 0, compactFractionDigits: fractionDigits });
}

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
