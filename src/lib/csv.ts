import { z } from 'zod';

// ── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into an array of row objects.
 * Handles:
 * - Quoted values (including commas within quotes)
 * - CRLF and LF line endings
 * - Whitespace trimming
 * - Empty row skipping
 * - Case-insensitive header normalization (to lowercase)
 */
export function parseCsv(csvText: string): Record<string, string>[] {
  // Normalize line endings
  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  if (lines.length < 2) return [];

  // Parse a single CSV line, respecting quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote inside quoted field
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  // Parse headers (normalize to lowercase)
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim());

  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip empty rows
    if (!line) continue;

    const values = parseLine(line);
    // Skip rows where all values are empty
    if (values.every((v) => !v)) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() ?? '';
    });
    rows.push(row);
  }

  return rows;
}

// ── Zod Schema ───────────────────────────────────────────────────────────────

export const ProductCsvRowSchema = z.object({
  internal_sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  brand_slug: z.string().min(1, 'Brand slug is required'),
  mrp: z.coerce.number().positive('MRP must be positive'),
  base_selling_price: z.coerce.number().positive('Selling price must be positive'),
  gst_rate: z.coerce.number().min(0).max(100, 'GST rate must be 0-100'),
  hsn_code: z.string().min(1, 'HSN code is required'),
  // Optional fields
  cost_price: z.union([z.literal(''), z.coerce.number().positive()]).optional().transform((v) =>
    v === '' || v === undefined ? undefined : (v as number)
  ),
  default_uom: z.string().optional().transform((v) => (v === '' ? undefined : v)),
  pack_size: z.union([z.literal(''), z.coerce.number().positive()]).optional().transform((v) =>
    v === '' || v === undefined ? undefined : (v as number)
  ),
  description: z.string().optional().transform((v) => (v === '' ? undefined : v)),
});

export type ProductCsvRow = z.infer<typeof ProductCsvRowSchema>;

// ── ParsedRow ────────────────────────────────────────────────────────────────

export interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  data?: ProductCsvRow;
  errors?: string[];
  isValid: boolean;
}

// ── Validator ────────────────────────────────────────────────────────────────

/**
 * Validate an array of raw CSV row objects.
 * Also checks for duplicate internal_sku within the batch.
 */
export function validateCsvRows(rows: Record<string, string>[]): ParsedRow[] {
  const seenSkus = new Set<string>();

  return rows.map((raw, idx) => {
    const result = ProductCsvRowSchema.safeParse(raw);
    const errors: string[] = [];

    if (!result.success) {
      result.error.issues.forEach((issue) => errors.push(issue.message));
    }

    const sku = raw.internal_sku?.trim();
    if (sku && seenSkus.has(sku)) {
      errors.push('Duplicate SKU in this import batch');
    } else if (sku) {
      seenSkus.add(sku);
    }

    return {
      rowIndex: idx + 1,
      raw,
      data: result.success ? result.data : undefined,
      errors: errors.length > 0 ? errors : undefined,
      isValid: errors.length === 0 && result.success,
    };
  });
}

// ── Template ─────────────────────────────────────────────────────────────────

export const PRODUCT_CSV_TEMPLATE_HEADERS = [
  'internal_sku',
  'name',
  'brand_slug',
  'mrp',
  'base_selling_price',
  'gst_rate',
  'hsn_code',
  'cost_price',
  'default_uom',
  'pack_size',
  'description',
] as const;

export function generateCsvTemplate(): string {
  return (
    PRODUCT_CSV_TEMPLATE_HEADERS.join(',') +
    '\n' +
    'SKU001,Product Name,brand-slug,100,85,18,6205,75,pcs,12,Optional description\n'
  );
}
