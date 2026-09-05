import type { ImportAnomaly, ImportAnomalyKind, OnboardingImportRow } from '@/lib/onboarding/types';
import { onboardingSlugify } from '@/lib/onboarding/slugify';

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
  };
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
