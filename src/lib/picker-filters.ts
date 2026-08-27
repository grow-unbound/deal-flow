export interface PickerQuickFilterDef {
  key: string;
  label: string;
}

export interface PickerAdvancedFilterOption {
  value: string;
  label: string;
}

export interface PickerAdvancedFilterDef {
  key: string;
  label: string;
  /** Static options; entity-specific dynamic lists (locations/brands/categories) are appended by the caller. */
  options: PickerAdvancedFilterOption[];
}

export const BUYER_QUICK_FILTERS: PickerQuickFilterDef[] = [
  { key: 'has_dues', label: 'Has dues' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'app_enabled', label: 'App enabled' },
  { key: 'dormant_qtr', label: 'Dormant this quarter' },
  { key: 'buying_qtr', label: 'Buying this quarter' },
  { key: 'enquire_no_sales', label: 'Enquire, no sales' },
  { key: 'top20', label: 'Top 20% buyers' },
];

export const BUYER_STATUS_OPTIONS: PickerAdvancedFilterOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'dormant', label: 'Dormant' },
  { value: 'inactive', label: 'Inactive' },
];

export const BUYER_APP_OPTIONS: PickerAdvancedFilterOption[] = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'not_enabled', label: 'Not enabled' },
];

export const BUYER_OUTSTANDING_OPTIONS: PickerAdvancedFilterOption[] = [
  { value: 'has_dues', label: 'Has dues' },
  { value: 'overdue', label: 'Overdue' },
];

/** Advanced filter defs for buyers (excludes 'sales_location', which is appended by the caller once location options load). */
export const BUYER_ADVANCED_FILTERS: PickerAdvancedFilterDef[] = [
  { key: 'status', label: 'Status', options: BUYER_STATUS_OPTIONS },
  { key: 'buyer_app', label: 'Buyer app', options: BUYER_APP_OPTIONS },
  { key: 'outstanding', label: 'Outstanding', options: BUYER_OUTSTANDING_OPTIONS },
];

/** Quick filter -> linked advanced { group, value } pair. Toggling the chip visibly syncs the dropdown. */
export const BUYER_QUICK_ADVANCED_LINKS: Record<string, { group: string; value: string }> = {
  overdue: { group: 'outstanding', value: 'overdue' },
  has_dues: { group: 'outstanding', value: 'has_dues' },
  app_enabled: { group: 'buyer_app', value: 'enabled' },
  dormant_qtr: { group: 'status', value: 'dormant' },
  buying_qtr: { group: 'status', value: 'active' },
};

export const PRODUCT_QUICK_FILTERS: PickerQuickFilterDef[] = [
  { key: 'selling_oos', label: 'Selling, out of stock' },
  { key: 'selling_low_stock', label: 'Selling, low stock' },
  { key: 'selling_qtr', label: 'Selling this quarter' },
  { key: 'not_selling_qtr', label: 'Not selling this quarter' },
  { key: 'enquire_no_sales', label: 'Enquire, no sales' },
  { key: 'top20', label: 'Top 20% products' },
];

export const PRODUCT_STOCK_OPTIONS: PickerAdvancedFilterOption[] = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
];

export const PRODUCT_STATUS_OPTIONS: PickerAdvancedFilterOption[] = BUYER_STATUS_OPTIONS;

/** Advanced filter defs for products (excludes 'brands'/'categories', appended by the caller once loaded). */
export const PRODUCT_ADVANCED_FILTERS: PickerAdvancedFilterDef[] = [
  { key: 'stock', label: 'Stock', options: PRODUCT_STOCK_OPTIONS },
  { key: 'status', label: 'Status', options: PRODUCT_STATUS_OPTIONS },
];

export const PRODUCT_QUICK_ADVANCED_LINKS: Record<string, { group: string; value: string }> = {
  selling_oos: { group: 'stock', value: 'out_of_stock' },
  selling_low_stock: { group: 'stock', value: 'low_stock' },
  selling_qtr: { group: 'status', value: 'active' },
  not_selling_qtr: { group: 'status', value: 'dormant' },
};
