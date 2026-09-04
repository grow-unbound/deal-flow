export const ONBOARDING_YUKTI_FIELDS = [
  'name',
  'internal_sku',
  'brand',
  'category',
  'mrp',
  'base_selling_price',
  'gst_rate',
  'hsn_code',
  'cost_price',
  'default_uom',
  'pack_size',
  'description',
] as const;

export type OnboardingYuktiField = (typeof ONBOARDING_YUKTI_FIELDS)[number];

export type OnboardingYuktiFieldOption = OnboardingYuktiField | 'unmapped';

export interface ColumnMappingEntry {
  sourceHeader: string;
  sampleValue: string;
  yuktiField: OnboardingYuktiFieldOption;
  confidence: number;
  suggestedField: OnboardingYuktiFieldOption;
  suggestedConfidence: number;
}

export type ImportAnomalyKind =
  | 'missing_gst'
  | 'zero_price'
  | 'missing_hsn'
  | 'duplicate_sku_in_file'
  | 'missing_name'
  | 'missing_sku';

export interface ImportAnomaly {
  sku: string;
  productName: string;
  kind: ImportAnomalyKind;
  message: string;
  productId?: string;
}

export interface OnboardingImportRow {
  internal_sku: string;
  name: string;
  brand?: string;
  category?: string;
  mrp?: number;
  base_selling_price?: number;
  gst_rate?: number;
  hsn_code?: string;
  cost_price?: number;
  default_uom?: string;
  pack_size?: number;
  description?: string;
}

export interface OnboardingImportChunkResult {
  imported: number;
  updated: number;
  failed: number;
  anomalies: ImportAnomaly[];
}

export type CatalogPricingMode = 'hidden_until_login' | 'base_selling_rate' | 'assigned_price_list';

export interface OnboardingCatalogState {
  productCount: number;
  anomalyCount: number;
  anomalies: ImportAnomaly[];
  slug: string;
  pricingMode: CatalogPricingMode | null;
  priceListId: string | null;
  live: boolean;
  storefrontUrl: string | null;
}
