import { z } from 'zod';

export const WarehouseStatusSchema = z.enum(['active', 'inactive']);
export type WarehouseStatus = z.infer<typeof WarehouseStatusSchema>;

export const WarehouseStockStatusSchema = z.enum(['clear', 'low_stock', 'out_of_stock']);
export type WarehouseStockStatus = z.infer<typeof WarehouseStockStatusSchema>;

export const WarehouseAddressSchema = z.object({
  line1: z.string().max(500).default(''),
  line2: z.string().max(500).default('').optional(),
  city: z.string().max(200).default(''),
  state: z.string().max(2).default(''),
  pincode: z.string().max(10).default(''),
});

export type WarehouseAddress = z.infer<typeof WarehouseAddressSchema>;

export const WarehouseAssociatedUserSchema = z.object({
  email: z.string().trim().email('Valid email required'),
  user_name: z.string().trim().nullable().optional(),
  user_id: z.string().trim().nullable().optional(),
});

export type WarehouseAssociatedUser = z.infer<typeof WarehouseAssociatedUserSchema>;

export const CreateWarehouseInputSchema = z.object({
  name: z.string().min(1, 'Warehouse name is required').max(200),
  location_id: z.string().uuid().nullable().optional(),
  address: WarehouseAddressSchema.optional(),
  phone_number: z.string().trim().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits').nullable().optional(),
  status: WarehouseStatusSchema.optional().default('active'),
  is_default: z.boolean().optional().default(false),
  associated_users: z.array(WarehouseAssociatedUserSchema).optional().default([]),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export type CreateWarehouseInput = z.infer<typeof CreateWarehouseInputSchema>;

export const UpdateWarehouseInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  location_id: z.string().uuid().nullable().optional(),
  address: WarehouseAddressSchema.partial().optional(),
  phone_number: z.string().trim().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits').nullable().optional(),
  status: WarehouseStatusSchema.optional(),
  is_default: z.boolean().optional(),
  associated_users: z.array(WarehouseAssociatedUserSchema).optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
}).strict();

export type UpdateWarehouseInput = z.infer<typeof UpdateWarehouseInputSchema>;

export interface TenantWarehouse {
  id: string;
  tenant_id: string;
  location_id: string | null;
  name: string;
  address: WarehouseAddress;
  phone_number: string | null;
  status: WarehouseStatus;
  is_default: boolean;
  external_ref: string | null;
  associated_users: WarehouseAssociatedUser[];
  lat: number | null;
  lng: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  location: {
    id: string;
    name: string;
    is_default: boolean;
    associated_users: WarehouseAssociatedUser[];
  } | null;
}

export interface WarehousesLandingKpis {
  active_warehouses: number;
  tracked_skus: number;
  low_stock_warehouses: number;
  idle_stock_skus: number;
  /** Total warehouses in scope, regardless of search/status/stock filters — subtitle context only. */
  warehouse_count: number;
  /** Distinct locations with at least one linked warehouse in scope — subtitle context only. */
  location_count: number;
}

export interface WarehousesLandingKpiCardV4 {
  id: string;
  value: number;
  entity_count?: number;
  document_count?: number | null;
  secondary_value?: number | null;
  time_basis?: string;
  filter_preset?: Record<string, unknown>;
}

export interface WarehousesLandingMetricsV4 {
  page_key: string;
  period: {
    period_key: string;
    grain: string;
    period_start: string;
    period_end_exclusive: string;
    label?: string;
  };
  computed_at: string | null;
  source_watermark: string | null;
  cards: WarehousesLandingKpiCardV4[];
}

export interface WarehousesLandingRow {
  id: string;
  name: string;
  initials: string;
  city: string;
  state: string;
  linked_location_name: string | null;
  status: WarehouseStatus;
  is_default: boolean;
  tracked_skus: number;
  sellable_units: number;
  low_stock_skus: number;
  stockout_skus: number;
  idle_stock_skus: number;
  stock_status: WarehouseStockStatus;
  last_updated: string;
  associated_users_count: number;
  sold_sku_count: number;
  sold_units: number;
  invoice_value: number;
}

export interface WarehousesLandingCalloutRow {
  id: string;
  name: string;
  initials: string;
  city: string;
  value: number;
  last_updated?: string;
}

export interface WarehousesLandingResponse {
  kpis?: WarehousesLandingKpis;
  callouts?: {
    stock_attention: WarehousesLandingCalloutRow[];
    idle_stock: WarehousesLandingCalloutRow[];
    recently_replenished: WarehousesLandingCalloutRow[];
  };
  warehouses: WarehousesLandingRow[];
  total: number;
  limit?: number;
  nextCursor?: string | null;
  period?: string;
  period_key?: string;
  grain?: 'quarter';
  sort?: string;
  refreshed_at: string;
  as_of?: string;
  commercial_horizon_days?: number | null;
  filters?: import('@/lib/landing-filter-params').LandingFilterMeta;
}

export interface WarehouseDetailInventoryItem {
  tenant_product_id: string;
  sku: string;
  product_name: string;
  brand_name: string;
  qty_available: number;
  qty_reserved: number;
  sellable_units: number;
  reorder_point: number | null;
  stock_status: WarehouseStockStatus;
  image_url: string | null;
  last_updated: string;
  last_demand_at: string | null;
  is_idle: boolean;
}

export interface WarehouseInventoryTrendWeek {
  week_label: string;
  week_start: string;
  tracked_skus: number;
  sellable_units: number;
  low_stock_skus: number;
  stockout_skus: number;
}

export interface WarehouseStockPageResponse {
  items: WarehouseDetailInventoryItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface WarehouseDetailResponse {
  id: string;
  name: string;
  initials: string;
  status: WarehouseStatus;
  is_default: boolean;
  city: string;
  state: string;
  phone_number: string | null;
  external_ref: string | null;
  lat: number | null;
  lng: number | null;
  linked_location: {
    id: string;
    name: string;
    is_default: boolean;
    associated_users: WarehouseAssociatedUser[];
  } | null;
  address: WarehouseAddress;
  associated_users: WarehouseAssociatedUser[];
  created_at: string;
  updated_at: string;
  tracked_skus_count: number;
  /** Quarter-to-date KPI strip, sourced from metrics_warehouse_period_summary + metrics_warehouse_now_summary. */
  meta_strip: {
    sales_qtd_value: number;
    tracked_skus: number;
    sellable_units: number;
    low_stock_skus: number;
    out_of_stock_skus: number;
    idle_stock_skus: number;
    idle_stock_units: number;
  };
  details: {
    associated_users_count: number;
    stockout_skus: number;
    reorder_triggered_skus: number;
    last_inventory_update: string | null;
  };
  performance?: {
    inventory_health: {
      active_skus: number;
      low_stock_skus: number;
      stockout_skus: number;
      avg_sellable_per_sku: number | null;
    };
    stock_posture: {
      sellable_units: number;
      reorder_triggered_skus: number;
      is_default: boolean;
      linked_location_name: string | null;
    };
    inventory_trend: WarehouseInventoryTrendWeek[];
    idle_stock: Array<{
      tenant_product_id: string;
      product_name: string;
      brand_name: string;
      sellable_units: number;
      last_demand_at: string | null;
    }>;
    recent_replenishment: Array<{
      tenant_product_id: string;
      product_name: string;
      brand_name: string;
      qty_available: number;
      qty_reserved: number;
      updated_at: string;
    }>;
  };
  performance_cards?: unknown[];
  detail_v2?: unknown;
}
