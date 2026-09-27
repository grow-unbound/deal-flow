import type { ColumnMappingEntry, ImportAnomaly, ImportAnomalyKind, OnboardingImportRow } from '@/lib/onboarding/types';
import { onboardingSlugify } from '@/lib/onboarding/slugify';

const VARIANT_HEADER_ALIASES = new Map<string, string>([
  ['size', 'Size'],
  ['colour', 'Color'],
  ['color', 'Color'],
  ['material', 'Material'],
  ['finish', 'Finish'],
  ['length', 'Length'],
  ['height', 'Height'],
  ['width', 'Width'],
  ['diameter', 'Diameter'],
  ['dia', 'Diameter'],
  ['pressure', 'Pressure'],
  ['gauge', 'Gauge'],
  ['core', 'Core'],
  ['cores', 'Core'],
  ['capacity', 'Capacity'],
  ['wattage', 'Wattage'],
  ['watts', 'Wattage'],
  ['voltage', 'Voltage'],
  ['variant', 'Variant'],
  ['option', 'Option'],
  ['model', 'Model'],
]);

function normalizeVariantKey(header: string): string | null {
  const stripped = header
    .trim()
    .replace(/^(attr|attribute|variant|option)[:_\-\s]+/i, '')
    .trim();
  if (!stripped) return null;
  const normalized = stripped.toLowerCase().replace(/[_\-\s]+/g, ' ');
  const compact = normalized.replace(/\s/g, '');
  const known = VARIANT_HEADER_ALIASES.get(normalized) ?? VARIANT_HEADER_ALIASES.get(compact);
  if (known) return known;
  if (/^(attr|attribute|variant|option)[:_\-\s]+/i.test(header.trim())) {
    return stripped.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  }
  return null;
}

export function extractVariantAttributes(
  rawRow: Record<string, string>,
  mappings: ColumnMappingEntry[],
): Record<string, string> {
  const attrs: Record<string, string> = {};
  const mappedHeaders = new Set(
    mappings
      .filter((mapping) => mapping.yuktiField !== 'unmapped')
      .map((mapping) => mapping.sourceHeader),
  );
  for (const mapping of mappings) {
    if (mappedHeaders.has(mapping.sourceHeader)) continue;
    const key = normalizeVariantKey(mapping.sourceHeader);
    const value = rawRow[mapping.sourceHeader]?.trim();
    if (key && value) attrs[key] = value;
  }
  return attrs;
}

export function mapRawRowToImport(row: Record<string, string>): OnboardingImportRow | null {
  const internal_sku = row.internal_sku?.trim();
  if (!internal_sku) return null;

  const name = row.name?.trim() || internal_sku;
  const parseNum = (v?: string): number | undefined => {
    if (!v?.trim()) return undefined;
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    internal_sku,
    name,
    product_family_name: row.product_family_name?.trim() || undefined,
    brand: row.brand?.trim() || undefined,
    category: row.category?.trim() || undefined,
    mrp: parseNum(row.mrp),
    base_selling_price: parseNum(row.base_selling_price),
    gst_rate: parseNum(row.gst_rate),
    hsn_code: row.hsn_code?.trim() || undefined,
    cost_price: parseNum(row.cost_price),
    default_uom: row.default_uom?.trim() || undefined,
    pack_size: parseNum(row.pack_size),
    description: row.description?.trim() || undefined,
    variant_attributes: undefined,
  };
}

export function mapSpreadsheetRowToImport(
  rawRow: Record<string, string>,
  mappedRow: Record<string, string>,
  mappings: ColumnMappingEntry[],
): OnboardingImportRow | null {
  const row = mapRawRowToImport(mappedRow);
  if (!row) return null;
  const variantAttributes = extractVariantAttributes(rawRow, mappings);
  return Object.keys(variantAttributes).length > 0
    ? { ...row, variant_attributes: variantAttributes }
    : row;
}

export function detectRowAnomalies(row: OnboardingImportRow, duplicateInFile: boolean): ImportAnomaly[] {
  const anomalies: ImportAnomaly[] = [];
  const base = { sku: row.internal_sku, productName: row.name };

  if (duplicateInFile) {
    anomalies.push({
      ...base,
      kind: 'duplicate_sku_in_file',
      message: 'Duplicate SKU in this file — last row wins',
    });
  }
  if (!row.name || row.name === row.internal_sku) {
    anomalies.push({
      ...base,
      kind: 'missing_name',
      message: 'Product name missing — using SKU as name',
    });
  }
  if (!row.internal_sku?.trim()) {
    anomalies.push({ ...base, kind: 'missing_sku', message: 'SKU missing' });
  }
  if (row.gst_rate == null) {
    anomalies.push({ ...base, kind: 'missing_gst', message: 'GST rate missing' });
  }
  if (row.base_selling_price == null || row.base_selling_price <= 0) {
    anomalies.push({ ...base, kind: 'zero_price', message: 'Base selling rate missing' });
  }
  if (!row.hsn_code) {
    anomalies.push({ ...base, kind: 'missing_hsn', message: 'HSN code missing' });
  }

  return anomalies;
}

export function uniqueSlugForName(
  name: string,
  taken: Set<string>,
): string {
  const base = onboardingSlugify(name) || 'item';
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  const slug = `${base}-${i}`;
  taken.add(slug);
  return slug;
}

export function anomalyKindNeedsFix(kind: ImportAnomalyKind): boolean {
  return kind === 'missing_gst' || kind === 'zero_price' || kind === 'missing_sku';
}
