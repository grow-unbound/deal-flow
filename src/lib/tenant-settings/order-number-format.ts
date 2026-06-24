/**
 * Live preview for order number format tokens (spec §6.1).
 * Supported: `{SEQ}` → 0001, `{YYYY}`, `{MM}`, `{DD}` from a reference date (defaults to now).
 */
export function previewOrderNumberFormat(format: string, refDate = new Date()): string {
  const yyyy = String(refDate.getFullYear());
  const mm = String(refDate.getMonth() + 1).padStart(2, '0');
  const dd = String(refDate.getDate()).padStart(2, '0');
  return format
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{MM\}/g, mm)
    .replace(/\{DD\}/g, dd)
    .replace(/\{SEQ\}/g, '0001');
}

export type DateFormatOption = 'none' | 'YYYY' | 'YYYYMM' | 'YYYYMMDD';

export interface OrderNumberDisplayFormat {
  prefix: string;
  date_format: DateFormatOption;
}

export const DATE_FORMAT_OPTION_LABELS: Record<DateFormatOption, string> = {
  none: 'No date (e.g. EST-001)',
  YYYY: 'Year (e.g. EST-2024-001)',
  YYYYMM: 'Year-Month (e.g. EST-2024-06-001)',
  YYYYMMDD: 'Full date (e.g. EST-20240624-001)',
};

/** Derive a display-friendly {prefix, date_format} from a stored format string. */
export function parseFormatToDisplay(format: string): OrderNumberDisplayFormat {
  // Detect which date token(s) are present
  const hasYyyy = format.includes('{YYYY}');
  const hasMm = format.includes('{MM}');
  const hasDd = format.includes('{DD}');

  let date_format: DateFormatOption;
  if (hasYyyy && hasMm && hasDd) date_format = 'YYYYMMDD';
  else if (hasYyyy && hasMm) date_format = 'YYYYMM';
  else if (hasYyyy) date_format = 'YYYY';
  else date_format = 'none';

  // Strip all tokens and separators to extract the prefix
  const withoutTokens = format
    .replace(/\{YYYY\}/g, '')
    .replace(/\{MM\}/g, '')
    .replace(/\{DD\}/g, '')
    .replace(/\{SEQ\}/g, '')
    .replace(/^[-/_.]+|[-/_.]+$/g, ''); // trim leading/trailing separators

  return { prefix: withoutTokens.replace(/[-/_.]+$/, ''), date_format };
}

/** Build a format string from display inputs. Always uses '-' as separator and appends {SEQ}. */
export function buildFormatFromDisplay({ prefix, date_format }: OrderNumberDisplayFormat): string {
  const parts: string[] = [];
  if (prefix.trim()) parts.push(prefix.trim().toUpperCase());
  if (date_format === 'YYYY') parts.push('{YYYY}');
  else if (date_format === 'YYYYMM') parts.push('{YYYY}', '{MM}');
  else if (date_format === 'YYYYMMDD') parts.push('{YYYY}', '{MM}', '{DD}');
  parts.push('{SEQ}');
  return parts.join('-');
}

/** Preview from display format inputs. */
export function previewDisplayFormat(display: OrderNumberDisplayFormat, refDate = new Date()): string {
  return previewOrderNumberFormat(buildFormatFromDisplay(display), refDate);
}
