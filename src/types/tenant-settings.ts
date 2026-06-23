import { z } from 'zod';

/** Indian GSTIN: 15 alphanumeric chars (empty allowed to clear). */
export const GstinSchema = z
  .string()
  .trim()
  .refine((s) => s.length === 0 || /^[0-9A-Z]{15}$/i.test(s), 'GSTIN must be 15 alphanumeric characters');

export const TenantAddressSchema = z.object({
  line1: z.string().max(500).default(''),
  line2: z.string().max(500).default(''),
  city: z.string().max(200).default(''),
  state: z.string().max(2).default(''),
  pincode: z.string().max(10).default(''),
});

export const TenantSettingsBusinessSchema = z.object({
  company_name: z.string().min(1, 'Company name is required').max(200),
  gstin: GstinSchema,
  logo_url: z.string().url().nullable().optional(),
  address: TenantAddressSchema,
  phone: z.string().max(40).default(''),
  email: z
    .string()
    .max(320)
    .default('')
    .refine((s) => s === '' || z.string().email().safeParse(s).success, 'Invalid email'),
});

export const WhatsappNotificationsSchema = z.object({
  enquiry_received: z.boolean(),
  order_placed: z.boolean(),
  order_confirmed_to_buyer: z.boolean(),
  dispatch_to_buyer: z.boolean(),
  catalog_shared_to_buyer: z.boolean(),
  response_eta_hours: z.number().int().min(1).max(168).optional(),
});

export const TenantSettingsNotificationsSchema = z.object({
  whatsapp: WhatsappNotificationsSchema,
});

export const GstRateSchema = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(12),
  z.literal(18),
  z.literal(28),
]);

export const ProductDefaultsSchema = z.object({
  uom: z.string().min(1).max(32),
});

export const BusinessPolicySchema = z.object({
  credit_enabled: z.boolean().default(true),
  gst_inclusive: z.boolean().default(false),
  gst_rate: GstRateSchema.default(18),
});
export type BusinessPolicy = z.infer<typeof BusinessPolicySchema>;

export const InventoryLockStageSchema = z.enum(['enquiry', 'sales_order', 'invoice']);

export const OrdersFeaturesSchema = z.object({
  enquiries: z.boolean(),
  sales_orders: z.boolean(),
  invoices: z.boolean(),
});

export const OrdersSettingsSchema = z.object({
  enquiry_number_format: z.string().min(1).max(120).default('EST-{YYYY}-{SEQ}'),
  sales_order_number_format: z.string().min(1).max(120).default('SO-{YYYY}-{SEQ}'),
  invoice_number_format: z.string().min(1).max(120).default('INV-{YYYY}-{SEQ}'),
  inventory_lock_stage: InventoryLockStageSchema,
  invoice_pdf_enabled: z.boolean(),
  features: OrdersFeaturesSchema,
});

export const BuyerAppSettingsSchema = z.object({
  enabled: z.boolean(),
  whatsapp_number: z.string().max(40),
  share_link_expiry_enabled: z.boolean(),
  share_link_expiry_days: z.number().int().min(1).max(3650),
  credit_limit_visible: z.boolean(),
  show_out_of_stock: z.boolean(),
});

export const PriceVisibilitySchema = z.enum(['discounted_only', 'show_both', 'hidden']);

export const CatalogSettingsSchema = z.object({
  cohort_pricing_enabled: z.boolean(),
  price_visibility: PriceVisibilitySchema,
  catalog_publishing_enabled: z.boolean(),
  default_catalog_expiry_days: z.number().int().min(0).max(3650),
});

export const DeliveryRoutingSchema = z.object({
  threshold_km: z.number().int().min(1).max(5000).default(300),
});
export type DeliveryRouting = z.infer<typeof DeliveryRoutingSchema>;

export const TenantSettingsStoredSchema = z
  .object({
    business: TenantSettingsBusinessSchema.partial().optional(),
    product_defaults: ProductDefaultsSchema.optional(),
    notifications: TenantSettingsNotificationsSchema.partial().optional(),
    orders: z
      .object({
        number_format: z.string().optional(), // legacy — used for backward-compat derivation only
        enquiry_number_format: z.string().min(1).max(120).optional(),
        sales_order_number_format: z.string().min(1).max(120).optional(),
        invoice_number_format: z.string().min(1).max(120).optional(),
        inventory_lock_stage: InventoryLockStageSchema.optional(),
        invoice_pdf_enabled: z.boolean().optional(),
        features: OrdersFeaturesSchema.partial().optional(),
      })
      .optional(),
    buyer_app: BuyerAppSettingsSchema.partial().optional(),
    catalog: CatalogSettingsSchema.partial().optional(),
    business_policy: BusinessPolicySchema.partial().optional(),
    delivery_routing_threshold_km: z.number().int().min(1).max(5000).optional(),
  })
  .passthrough();

export type TenantSettingsBusiness = z.infer<typeof TenantSettingsBusinessSchema>;
export type TenantSettingsNotifications = z.infer<typeof TenantSettingsNotificationsSchema>;
export type TenantSettingsStored = z.infer<typeof TenantSettingsStoredSchema>;
export type ProductDefaults = z.infer<typeof ProductDefaultsSchema>;
export type OrdersSettings = z.infer<typeof OrdersSettingsSchema>;
export type BuyerAppSettings = z.infer<typeof BuyerAppSettingsSchema>;
export type CatalogSettings = z.infer<typeof CatalogSettingsSchema>;

/** PATCH body: partial keys merged on server via app.update_tenant_settings. */
export const TenantSettingsPatchSchema = z.object({
  business: TenantSettingsBusinessSchema.partial().optional(),
  notifications: z
    .object({
      whatsapp: WhatsappNotificationsSchema.partial().optional(),
    })
    .optional(),
  product_defaults: ProductDefaultsSchema.partial().optional(),
  orders: z
    .object({
      enquiry_number_format: z.string().min(1).max(120).optional(),
      sales_order_number_format: z.string().min(1).max(120).optional(),
      invoice_number_format: z.string().min(1).max(120).optional(),
      inventory_lock_stage: InventoryLockStageSchema.optional(),
      invoice_pdf_enabled: z.boolean().optional(),
      features: OrdersFeaturesSchema.partial().optional(),
    })
    .optional(),
  buyer_app: BuyerAppSettingsSchema.partial().optional(),
  catalog: z
    .object({
      cohort_pricing_enabled: z.boolean().optional(),
      price_visibility: PriceVisibilitySchema.optional(),
      catalog_publishing_enabled: z.boolean().optional(),
      default_catalog_expiry_days: z.number().int().min(0).max(3650).optional(),
    })
    .optional(),
  business_policy: BusinessPolicySchema.partial().optional(),
  delivery_routing_threshold_km: z.number().int().min(1).max(5000).optional(),
});

export type TenantSettingsPatch = z.infer<typeof TenantSettingsPatchSchema>;

export interface GeneralSettingsView {
  business: TenantSettingsBusiness;
  notifications: TenantSettingsNotifications;
  business_policy: BusinessPolicy;
  delivery_routing_threshold_km: number;
  plan: 'starter' | 'growth' | 'scale';
}

export interface ModuleSettingsView {
  product_defaults: ProductDefaults;
  orders: OrdersSettings;
  buyer_app: BuyerAppSettings;
  catalog: CatalogSettings;
  business_policy: BusinessPolicy;
  plan: 'starter' | 'growth' | 'scale';
  usage: {
    cohorts: number;
    price_lists: number;
    catalogs: number;
  };
  open_counts: {
    enquiries: number;
    sales_orders: number;
    invoices: number;
  };
}

/** GET/PATCH /api/settings unified payload. */
export interface TenantSettingsApiPayload {
  general: GeneralSettingsView;
  modules: ModuleSettingsView;
}
