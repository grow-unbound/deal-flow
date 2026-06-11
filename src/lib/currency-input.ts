/** Round to 2 decimal places for currency amounts. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Format a number for currency-like integer inputs (en-IN, no decimals). */
export function formatNumberForInput(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
}

/** Parse digits from a formatted currency string to a number. */
export function parseCurrencyDigits(value: string): number {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return 0;
  return Number(digits);
}

/** Parse loose currency input (digits + optional decimal). */
export function parseCurrencyInput(value: string): number {
  const numeric = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}
