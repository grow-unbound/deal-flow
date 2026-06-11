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
