export type NumberFormatKind =
  | 'CURRENCY_EXACT'
  | 'CURRENCY_THRESHOLD'
  | 'PERCENTAGE'
  | 'COUNT';

export interface NumberFormatOptions {
  /** CURRENCY_THRESHOLD only; default 10_000 */
  threshold?: number;
  /** null/undefined/NaN → configurable fallback (default '—' for display) */
  fallback?: string;
}

const DEFAULT_THRESHOLD = 10_000;
const DEFAULT_FALLBACK = '—';

const inrWholeFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inrFractionalFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const countFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function isInvalidNumber(value: number | null | undefined): boolean {
  return value == null || Number.isNaN(value);
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasFractionalPart(value: number): boolean {
  const rounded = roundTo2(value);
  return Math.abs(rounded % 1) > 1e-9;
}

function formatCompactIndianNumber(value: number, fractionDigits = 2): string {
  const abs = Math.abs(value);
  if (abs < 1000) {
    return inrWholeFormatter.format(value);
  }

  const units = [
    { threshold: 10_000_000, suffix: 'Cr' },
    { threshold: 100_000, suffix: 'L' },
    { threshold: 1_000, suffix: 'K' },
  ];

  for (const unit of units) {
    if (abs >= unit.threshold) {
      const scaled = value / unit.threshold;
      if (fractionDigits <= 0) {
        return `${Math.round(scaled)}${unit.suffix}`;
      }
      return `${scaled.toFixed(fractionDigits)}${unit.suffix}`;
    }
  }

  return inrWholeFormatter.format(value);
}

function formatCurrencyExact(value: number): string {
  const rounded = roundTo2(value);
  if (hasFractionalPart(rounded)) {
    return `₹${inrFractionalFormatter.format(rounded)}`;
  }
  return `₹${inrWholeFormatter.format(rounded)}`;
}

function formatCurrencyThreshold(value: number, threshold: number): string {
  const rounded = roundTo2(value);
  if (Math.abs(rounded) < threshold) {
    return `₹${inrWholeFormatter.format(rounded)}`;
  }
  return `₹${formatCompactIndianNumber(rounded, 2)}`;
}

function formatPercentage(value: number): string {
  return `${percentFormatter.format(roundTo2(value))}%`;
}

function formatCount(value: number): string {
  return countFormatter.format(Math.trunc(value));
}

export function formatNumberValue(
  value: number | null | undefined,
  kind: NumberFormatKind,
  options: NumberFormatOptions = {},
): string {
  if (isInvalidNumber(value)) {
    return options.fallback ?? DEFAULT_FALLBACK;
  }

  const numeric = Number(value);

  switch (kind) {
    case 'CURRENCY_EXACT':
      return formatCurrencyExact(numeric);
    case 'CURRENCY_THRESHOLD':
      return formatCurrencyThreshold(numeric, options.threshold ?? DEFAULT_THRESHOLD);
    case 'PERCENTAGE':
      return formatPercentage(numeric);
    case 'COUNT':
      return formatCount(numeric);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function formatCurrencyExactInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const [intPartRaw, decPartRaw] = cleaned.split('.');
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '') || '0';
  const formattedInt = inrWholeFormatter.format(Number(intPart));
  if (decPartRaw == null) return formattedInt;
  return `${formattedInt}.${decPartRaw.slice(0, 2)}`;
}

function parseCurrencyExactInput(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCountInput(value: number | string | null | undefined): string {
  if (value == null || value === '') return '';
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^\d]/g, ''));
  if (!Number.isFinite(numeric)) return '';
  return countFormatter.format(Math.trunc(numeric));
}

function parseCountInput(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercentageInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const [intPartRaw, decPartRaw] = cleaned.split('.');
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '') || '0';
  if (decPartRaw == null) return intPart;
  return `${intPart}.${decPartRaw.slice(0, 2)}`;
}

function parsePercentageInput(raw: string): number | null {
  const normalized = raw.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumberInput(
  value: number | string | null | undefined,
  kind: NumberFormatKind,
): string {
  if (kind === 'CURRENCY_THRESHOLD') {
    throw new Error('CURRENCY_THRESHOLD is display-only; use CURRENCY_EXACT for inputs');
  }

  if (kind === 'CURRENCY_EXACT') {
    if (value == null || value === '') return '';
    return formatCurrencyExactInput(String(value));
  }

  if (kind === 'COUNT') {
    return formatCountInput(value);
  }

  if (kind === 'PERCENTAGE') {
    if (value == null || value === '') return '';
    return formatPercentageInput(String(value));
  }

  return '';
}

export function parseNumberInput(raw: string, kind: NumberFormatKind): number | null {
  if (kind === 'CURRENCY_THRESHOLD') {
    throw new Error('CURRENCY_THRESHOLD is display-only; use CURRENCY_EXACT for inputs');
  }

  switch (kind) {
    case 'CURRENCY_EXACT':
      return parseCurrencyExactInput(raw);
    case 'COUNT':
      return parseCountInput(raw);
    case 'PERCENTAGE':
      return parsePercentageInput(raw);
    default:
      return null;
  }
}

const asOfTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Freshness stamp for snapshot-backed KPI cards -- "as of HH:MM" in IST.
 * Returns null when there's no valid timestamp so callers can omit the
 * stamp entirely rather than render a misleading "as of --:--".
 */
export function formatAsOfLabel(isoTimestamp: string | null | undefined): string | null {
  if (!isoTimestamp) return null;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return null;
  return `as of ${asOfTimeFormatter.format(date)} IST`;
}
