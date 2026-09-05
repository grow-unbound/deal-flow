import { token_set_ratio } from 'fuzzball';
import type { OnboardingYuktiField, OnboardingYuktiFieldOption, ColumnMappingEntry } from '@/lib/onboarding/types';
import { ONBOARDING_YUKTI_FIELDS } from '@/lib/onboarding/types';

const FIELD_LABELS: Record<OnboardingYuktiField, string> = {
  name: 'Name',
  internal_sku: 'SKU',
  brand: 'Brand',
  category: 'Category',
  mrp: 'MRP',
  base_selling_price: 'Base rate',
  gst_rate: 'GST rate',
  hsn_code: 'HSN',
  cost_price: 'Cost price',
  default_uom: 'UOM',
  pack_size: 'Pack size',
  description: 'Description',
};

/** Alias table — exact normalized header → Yukti field (before fuzzball). */
const HEADER_ALIASES: Record<string, OnboardingYuktiField> = {
  sku: 'internal_sku',
  'item code': 'internal_sku',
  itemcode: 'internal_sku',
  'product code': 'internal_sku',
  productcode: 'internal_sku',
  'internal sku': 'internal_sku',
  internalsku: 'internal_sku',
  'product name': 'name',
  productname: 'name',
  item: 'name',
  title: 'name',
  brand: 'brand',
  'brand name': 'brand',
  brandname: 'brand',
  'brand slug': 'brand',
  brandslug: 'brand',
  manufacturer: 'brand',
  category: 'category',
  'product category': 'category',
  mrp: 'mrp',
  'max retail price': 'mrp',
  rate: 'base_selling_price',
  price: 'base_selling_price',
  'selling price': 'base_selling_price',
  'base price': 'base_selling_price',
  'base selling price': 'base_selling_price',
  'base rate': 'base_selling_price',
  bsp: 'base_selling_price',
  gst: 'gst_rate',
  'gst rate': 'gst_rate',
  'gst %': 'gst_rate',
  gstpercent: 'gst_rate',
  hsn: 'hsn_code',
  'hsn code': 'hsn_code',
  hsncode: 'hsn_code',
  cost: 'cost_price',
  'cost price': 'cost_price',
  uom: 'default_uom',
  unit: 'default_uom',
  'pack size': 'pack_size',
  packsize: 'pack_size',
  desc: 'description',
  description: 'description',
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_\s]+/g, ' ');
}

export function yuktiFieldLabel(field: OnboardingYuktiField): string {
  return FIELD_LABELS[field];
}

/** SKU is required to import. The rest are prompted when absent but do not block. */
export const ONBOARDING_REQUIRED_FIELDS: OnboardingYuktiField[] = ['internal_sku'];

export const ONBOARDING_ESSENTIAL_FIELDS: OnboardingYuktiField[] = [
  'name',
  'brand',
  'category',
  'base_selling_price',
  'gst_rate',
];

export function mappedYuktiFields(mappings: ColumnMappingEntry[]): Set<OnboardingYuktiField> {
  const mapped = new Set<OnboardingYuktiField>();
  for (const entry of mappings) {
    if (entry.yuktiField !== 'unmapped') mapped.add(entry.yuktiField);
  }
  return mapped;
}

export function missingEssentialFields(mappings: ColumnMappingEntry[]): OnboardingYuktiField[] {
  const mapped = mappedYuktiFields(mappings);
  return ONBOARDING_ESSENTIAL_FIELDS.filter((field) => !mapped.has(field));
}

export function suggestYuktiField(header: string): { field: OnboardingYuktiFieldOption; confidence: number } {
  const normalized = normalizeHeader(header);
  const aliasHit = HEADER_ALIASES[normalized.replace(/\s/g, '')] ?? HEADER_ALIASES[normalized];
  if (aliasHit) {
    return { field: aliasHit, confidence: 100 };
  }

  let bestField: OnboardingYuktiFieldOption = 'unmapped';
  let bestScore = 0;

  for (const field of ONBOARDING_YUKTI_FIELDS) {
    const label = FIELD_LABELS[field].toLowerCase();
    const score = token_set_ratio(normalized, label);
    if (score > bestScore) {
      bestScore = score;
      bestField = field;
    }
  }

  if (bestScore < 55) {
    return { field: 'unmapped', confidence: bestScore };
  }

  return { field: bestField, confidence: bestScore };
}

export function buildColumnMappings(
  headers: string[],
  sampleRow: Record<string, string>,
): ColumnMappingEntry[] {
  const used = new Set<OnboardingYuktiField>();

  return headers.map((header) => {
    const suggestion = suggestYuktiField(header);
    let yuktiField = suggestion.field;
    let confidence = suggestion.confidence;

    if (yuktiField !== 'unmapped' && used.has(yuktiField)) {
      yuktiField = 'unmapped';
      confidence = 0;
    } else if (yuktiField !== 'unmapped') {
      used.add(yuktiField);
    }

    return {
      sourceHeader: header,
      sampleValue: sampleRow[header] ?? '',
      yuktiField,
      confidence,
      suggestedField: suggestion.field,
      suggestedConfidence: suggestion.confidence,
    };
  });
}

export function isOverriddenMapping(entry: ColumnMappingEntry): boolean {
  return entry.yuktiField !== 'unmapped' && entry.yuktiField !== entry.suggestedField;
}

export function duplicateYuktiFields(mappings: ColumnMappingEntry[]): OnboardingYuktiField[] {
  const counts = new Map<OnboardingYuktiField, number>();
  for (const entry of mappings) {
    if (entry.yuktiField === 'unmapped') continue;
    counts.set(entry.yuktiField, (counts.get(entry.yuktiField) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([field]) => field);
}

export function reassignMappingField(
  mappings: ColumnMappingEntry[],
  index: number,
  next: OnboardingYuktiFieldOption,
): ColumnMappingEntry[] {
  return mappings.map((row, i) => {
    if (i === index) return { ...row, yuktiField: next };
    if (next !== 'unmapped' && row.yuktiField === next) {
      return { ...row, yuktiField: 'unmapped' };
    }
    return row;
  });
}

export async function hashHeaderRow(headers: string[]): Promise<string> {
  const normalized = headers.map((h) => normalizeHeader(h)).sort().join('|');
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function mappingsToRecord(mappings: ColumnMappingEntry[]): Record<string, OnboardingYuktiFieldOption> {
  const out: Record<string, OnboardingYuktiFieldOption> = {};
  for (const m of mappings) {
    out[m.sourceHeader] = m.yuktiField;
  }
  return out;
}

export function applyMappings(
  rows: Record<string, string>[],
  mappings: ColumnMappingEntry[],
): Record<string, string>[] {
  const fieldToHeader = new Map<OnboardingYuktiField, string>();
  for (const m of mappings) {
    if (m.yuktiField !== 'unmapped') {
      fieldToHeader.set(m.yuktiField, m.sourceHeader);
    }
  }

  return rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [field, header] of fieldToHeader) {
      mapped[field] = row[header] ?? '';
    }
    return mapped;
  });
}
