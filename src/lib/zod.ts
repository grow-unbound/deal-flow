import { z } from 'zod';

// Auth schemas
export const LoginSchema = z.object({
  identifier: z.string().min(1, 'Email or phone is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const SignUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^[0-9]{10}$/, 'Phone must be 10 digits'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  business_name: z.string().min(1, 'Business name is required'),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

export const WhatsAppOTPSchema = z.object({
  phone_number: z.string().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits'),
  otp: z.string().regex(/^[0-9]{6}$/, 'OTP must be 6 digits'),
});

// Tenant schemas
export const TenantSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric'),
  business_name: z.string().min(1, 'Business name is required'),
  gstin: z.string().optional(),
  primary_state: z.string().optional(),
  plan: z.enum(['starter', 'growth', 'scale']).default('starter'),
});

const OptionalEmailSchema = z.string().email('Invalid email address').optional().or(z.literal(''));
const OptionalPhoneSchema = z
  .string()
  .regex(/^[0-9]{10}$/, 'Phone must be 10 digits')
  .optional()
  .or(z.literal(''));

export const TenantBrandMetaSchema = z.object({
  display_name_override: z.string().trim().optional().or(z.literal('')),
  slug: z.string().trim().optional().or(z.literal('')),
  description: z.string().trim().optional().or(z.literal('')),
  logo_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  margin_pct: z.coerce.number().min(0, 'Margin must be 0 or more').max(100, 'Margin cannot exceed 100').optional().nullable(),
  exclusivity: z.boolean().nullable().optional(),
  external_ref: z.string().trim().optional().or(z.literal('')),
  principal_name: z.string().trim().optional().or(z.literal('')),
  principal_email: OptionalEmailSchema,
  principal_phone: OptionalPhoneSchema,
  principal_location: z.string().trim().optional().or(z.literal('')),
  contact_name: z.string().trim().optional().or(z.literal('')),
  contact_email: OptionalEmailSchema,
  contact_phone: OptionalPhoneSchema,
  default_cohort_id: z.string().uuid('Invalid cohort').optional().nullable(),
});

// Brand schemas
export const BrandSchema = z.object({
  name: z.string().min(1, 'Brand name is required'),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric'),
  description: z.string().optional().or(z.literal('')),
}).merge(TenantBrandMetaSchema.omit({ slug: true, description: true }));

// Schema for creating a private custom brand (used in CreateBrandForm)
export const CreateBrandSchema = z.object({
  name: z.string().min(1, 'Brand name is required'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters and hyphens.'),
  description: z.string().optional().or(z.literal('')),
}).merge(TenantBrandMetaSchema.omit({ slug: true, description: true }));

export const ImportedBrandCreateSchema = z.object({
  mode: z.literal('import'),
  master_brand_id: z.string().uuid('Invalid brand ID'),
  name: z.string().min(1, 'Brand name is required').optional(),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters and hyphens.')
    .optional(),
  description: z.string().optional().or(z.literal('')),
}).merge(TenantBrandMetaSchema.omit({ slug: true, description: true }));

export const CustomBrandCreateSchema = z.object({
  mode: z.literal('custom'),
  name: z.string().min(1, 'Brand name is required'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters and hyphens.'),
  description: z.string().optional().or(z.literal('')),
}).merge(TenantBrandMetaSchema.omit({ slug: true, description: true }));

export const BrandCreateSchema = z.discriminatedUnion('mode', [
  ImportedBrandCreateSchema,
  CustomBrandCreateSchema,
]);
export type BrandCreateInput = z.infer<typeof BrandCreateSchema>;

export const TenantBrandUpdateSchema = TenantBrandMetaSchema.partial().extend({
  display_name_override: z.string().trim().nullable().optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters and hyphens.')
    .nullable()
    .optional()
    .or(z.literal('')),
  description: z.string().trim().nullable().optional(),
  logo_url: z.string().trim().nullable().optional(),
  external_ref: z.string().trim().nullable().optional(),
  principal_name: z.string().trim().nullable().optional(),
  principal_email: z.string().trim().nullable().optional(),
  principal_phone: z.string().trim().nullable().optional(),
  principal_location: z.string().trim().nullable().optional(),
  contact_name: z.string().trim().nullable().optional(),
  contact_email: z.string().trim().nullable().optional(),
  contact_phone: z.string().trim().nullable().optional(),
  archive: z.boolean().optional(),
  is_active: z.boolean().optional(),
});
export type TenantBrandUpdateInput = z.infer<typeof TenantBrandUpdateSchema>;

// Tenant product schemas
export const TenantProductSchema = z.object({
  master_product_id: z.string().uuid('Invalid product ID'),
  internal_sku: z.string().min(1, 'Internal SKU is required'),
  mrp: z.number().positive('MRP must be positive'),
  base_selling_price: z.number().positive('Base selling price must be positive'),
  cost_price: z.number().positive().optional(),
  tenant_brand_id: z.string().uuid().optional(),
  name_override: z.string().optional(),
  default_uom: z.string().optional(),
  pack_size: z.number().positive().optional(),
});

// Product schemas
export const ProductSchema = z.object({
  brand_id: z.string().uuid('Invalid brand ID'),
  category_id: z.string().uuid().optional(),
  master_sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  default_uom: z.string().optional(),
  pack_size: z.coerce.number().positive().optional(),
  hsn_code: z.string().optional(),
  gst_rate: z.coerce.number().min(0).max(100).optional(),
  image_urls: z.string().url().array().default([]),
});

// Buyer schemas
export const BuyerSchema = z.object({
  business_name: z.string().min(1, 'Business name is required'),
  contact_name: z.string().optional(),
  phone: z.string().regex(/^[0-9]{10}$/, 'Phone must be 10 digits').optional(),
  email: z.string().email().optional(),
  gstin: z.string().optional(),
  tier: z.enum(['A', 'B', 'C']).optional(),
  credit_limit: z.coerce.number().default(0),
  payment_terms_days: z.coerce.number().default(0),
  external_ref: z.string().optional(),
});

export const BuyerGeographySchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  zone: z.string().optional(),
});

export const BuyerCreateSchema = z.object({
  business_name: z.string().min(1, 'Business name is required'),
  contact_name: z.string().optional(),
  phone: z.string().regex(/^[0-9]{10}$/, 'Phone must be 10 digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  gstin: z.string().optional(),
  geography: BuyerGeographySchema.optional(),
  credit_limit: z.coerce.number().default(0),
  payment_terms_days: z.coerce.number().default(0),
  tier: z.enum(['A', 'B', 'C']).optional(),
  external_ref: z.string().optional(),
  default_cohort_id: z.string().uuid('Invalid cohort').optional().nullable(),
});
export type BuyerCreateInput = z.infer<typeof BuyerCreateSchema>;

// Buyer update schema — partial, phone optional on edit, external_ref excluded from override
export const BuyerUpdateSchema = BuyerCreateSchema.partial().extend({
  // allow empty string for email/gstin to clear them; phone stays regex-validated when provided
  phone: z.string().regex(/^[0-9]{10}$/, 'Phone must be 10 digits').optional(),
});
export type BuyerUpdateInput = z.infer<typeof BuyerUpdateSchema>;

// Cohort schemas
export const CohortSchema = z.object({
  name: z.string().min(1, 'Cohort name is required'),
  description: z.string().optional(),
  is_static: z.boolean().default(false),
  rules: z.record(z.any()).optional(),
});

// Cohort rule schemas
export const CohortRuleFieldSchema = z.enum([
  'geography.label',
  'geography.state',
  'geography.city',
  'geography.zone',
  'tier',
  'brand_focus',
  'last_order_bucket',
  'gmv_90d_bucket',
  'buyer_id',
]);

export const CohortRuleOperatorSchema = z.enum(['eq', 'in', 'not_in']);

export const CohortLastOrderBucketSchema = z.enum([
  'anytime',
  'within_30_days',
  'within_90_days',
  'dormant_90_plus_days',
]);
export type CohortLastOrderBucket = z.infer<typeof CohortLastOrderBucketSchema>;

export const CohortGmv90dBucketSchema = z.enum([
  'gmv_0',
  'gmv_1_50000',
  'gmv_50001_200000',
  'gmv_200001_500000',
  'gmv_500001_plus',
]);
export type CohortGmv90dBucket = z.infer<typeof CohortGmv90dBucketSchema>;

export const CohortRuleFilterSchema = z.object({
  field: CohortRuleFieldSchema,
  operator: CohortRuleOperatorSchema,
  value: z.union([z.string(), z.array(z.string())]),
});

export const CohortRulesSchema = z.object({
  filters: z.array(CohortRuleFilterSchema).default([]),
  selected_buyer_ids: z.array(z.string().uuid()).default([]),
  excluded_buyer_ids: z.array(z.string().uuid()).default([]),
});

export const CohortCreateSchema = z.object({
  name: z.string().min(1, 'Cohort name is required'),
  description: z.string().optional(),
  is_static: z.boolean().default(false),
  rules: CohortRulesSchema.optional(),
});
export type CohortCreateInput = z.infer<typeof CohortCreateSchema>;

export const CohortUpdateSchema = CohortCreateSchema.partial();
export type CohortUpdateInput = z.infer<typeof CohortUpdateSchema>;
export type CohortRuleFilter = z.infer<typeof CohortRuleFilterSchema>;
export type CohortRules = z.infer<typeof CohortRulesSchema>;

// Price list schemas
export const PriceListSchema = z
  .object({
    name: z.string().min(1, 'Price list name is required'),
    currency: z.string().default('INR'),
    valid_from: z.coerce.date(),
    valid_to: z.coerce.date().optional(),
    priority: z.coerce.number().default(0),
  })
  .refine(
    (data) => {
      if (data.valid_to && data.valid_from) {
        return data.valid_to > data.valid_from;
      }
      return true;
    },
    {
      message: 'End date must be after start date.',
      path: ['valid_to'],
    },
  );

export const PriceListPricingStrategySchema = z.enum([
  'edit_each',
  'margin_from_mrp',
  'flat_off_base',
  'per_item',
  'percentage',
]);
export type PriceListPricingStrategy = z.infer<typeof PriceListPricingStrategySchema>;

export const PriceListFilterStateSchema = z.object({
  brand_names: z.array(z.string()).default([]),
  category_names: z.array(z.string()).default([]),
});
export type PriceListFilterState = z.infer<typeof PriceListFilterStateSchema>;

export const PriceListComposerPayloadSchema = z
  .object({
    name: z.string().min(1, 'Price list name is required'),
    currency: z.string().default('INR'),
    valid_from: z.coerce.date(),
    valid_to: z.coerce.date().optional(),
    priority: z.coerce.number().int().min(0).default(0),
    pricing_strategy: PriceListPricingStrategySchema.default('edit_each'),
    strategy_value: z.coerce.number().nonnegative().nullable().optional(),
    filters: PriceListFilterStateSchema.default({ brand_names: [], category_names: [] }),
    item_prices: z.array(
      z.object({
        tenant_product_id: z.string().uuid('Invalid product ID'),
        price: z.coerce.number().positive('Price must be positive'),
        min_qty: z.coerce.number().min(1).default(1),
        max_qty: z.coerce.number().positive().nullable().optional(),
      }),
    ).default([]),
    save_mode: z.enum(['draft', 'publish']).default('draft'),
  })
  .refine(
    (data) => {
      if (data.valid_to && data.valid_from) {
        return data.valid_to > data.valid_from;
      }
      return true;
    },
    {
      message: 'End date must be after start date.',
      path: ['valid_to'],
    },
  )
  .refine(
    (data) => {
      if (data.pricing_strategy === 'edit_each') {
        return true;
      }
      return data.strategy_value != null;
    },
    {
      message: 'Strategy value is required for the selected pricing strategy.',
      path: ['strategy_value'],
    },
  );
export type PriceListComposerPayload = z.infer<typeof PriceListComposerPayloadSchema>;

export const PriceListItemSchema = z.object({
  price: z.coerce.number().positive('Price must be positive'),
  min_qty: z.coerce.number().default(1),
  max_qty: z.coerce.number().optional(),
});

export const PriceListItemCreateSchema = z.object({
  tenant_product_id: z.string().uuid('Invalid product ID'),
  price: z.coerce.number().positive('Price must be positive'),
  min_qty: z.coerce.number().min(1).default(1),
  max_qty: z.coerce.number().positive().optional().nullable(),
});
export type PriceListItemCreateInput = z.infer<typeof PriceListItemCreateSchema>;

export const PriceListAssignmentSchema = z.object({
  target_type: z.enum(['buyer', 'cohort', 'all_buyers']),
  target_id: z.string().uuid().nullable().optional(),
}).refine(
  (d) => d.target_type === 'all_buyers' || (d.target_id != null && d.target_id !== ''),
  { message: 'Target is required for buyer or cohort assignments.', path: ['target_id'] }
);
export type PriceListAssignmentInput = z.infer<typeof PriceListAssignmentSchema>;

// Catalog schemas
export const PublishedCatalogSchema = z.object({
  name: z.string().min(1, 'Catalog name is required'),
  scope_type: z.enum(['cohort', 'buyer', 'geography', 'all']),
  valid_from: z.coerce.date(),
  valid_to: z.coerce.date().optional(),
  hero_image_url: z.string().url().optional(),
  message: z.string().optional(),
});

export const CatalogComposerAvailabilitySchema = z.enum([
  'new_in_stock_today',
  'in_stock_only',
  'low_stock_only',
  'old_stock',
  'show_everything',
]);
export type CatalogComposerAvailability = z.infer<typeof CatalogComposerAvailabilitySchema>;

export const CatalogComposerTagSchema = z.enum(['new', 'new_stock', 'old_stock']);
export type CatalogComposerTag = z.infer<typeof CatalogComposerTagSchema>;

export const CatalogComposerFilterStateSchema = z.object({
  brand_names: z.array(z.string()).default([]),
  category_names: z.array(z.string()).default([]),
  availability: CatalogComposerAvailabilitySchema.default('show_everything'),
});
export type CatalogComposerFilterState = z.infer<typeof CatalogComposerFilterStateSchema>;

export const CatalogComposerItemSchema = z.object({
  tenant_product_id: z.string().uuid('Invalid product ID'),
  display_order: z.coerce.number().int().min(0).default(0),
});
export type CatalogComposerItemInput = z.infer<typeof CatalogComposerItemSchema>;

export const CatalogComposerPayloadSchema = z
  .object({
    name: z.string().min(1, 'Catalog name is required'),
    scope_type: z.enum(['cohort', 'all']).default('cohort'),
    cohort_id: z.string().uuid('Cohort is required').nullable().optional(),
    valid_from: z.coerce.date(),
    valid_to: z.coerce.date().optional(),
    filters: CatalogComposerFilterStateSchema.default({
      brand_names: [],
      category_names: [],
      availability: 'show_everything',
    }),
    tag_overrides: z.record(CatalogComposerTagSchema.nullable()).default({}),
    items: z.array(CatalogComposerItemSchema).default([]),
    save_mode: z.enum(['draft', 'publish']).default('draft'),
  })
  .refine((data) => data.scope_type === 'all' || Boolean(data.cohort_id), {
    message: 'Cohort is required',
    path: ['cohort_id'],
  })
  .refine(
    (data) => {
      if (data.valid_to && data.valid_from) {
        return data.valid_to > data.valid_from;
      }
      return true;
    },
    {
      message: 'End date must be after start date.',
      path: ['valid_to'],
    },
  );
export type CatalogComposerPayload = z.infer<typeof CatalogComposerPayloadSchema>;

// Order schemas
export const OrderSchema = z.object({
  buyer_id: z.string().uuid('Invalid buyer ID'),
  notes: z.string().optional(),
});

export const OrderItemSchema = z.object({
  tenant_product_id: z.string().uuid('Invalid product ID'),
  qty: z.coerce.number().positive('Quantity must be positive'),
});

// Team member schemas
export const TeamMemberRoleSchema = z.enum(['seller_admin', 'seller_assistant']);

export const IndianPhoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{10}$/, 'Phone number must be 10 digits');

export const TeamMemberFormSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('Valid email required'),
  phone: IndianPhoneSchema,
  role: TeamMemberRoleSchema,
  location_ids: z.array(z.string().trim().min(1, 'Location is required')).nullable().optional(),
}).superRefine((data, ctx) => {
  const locationIds = data.location_ids ?? [];
  if (data.role === 'seller_assistant' && locationIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['location_ids'],
      message: 'Assign at least one location to a seller assistant.',
    });
  }
});

export const InviteUserSchema = TeamMemberFormSchema;

export const UpdateMemberSchema = TeamMemberFormSchema;

export const UpdateMemberRoleSchema = z.object({
  role: TeamMemberRoleSchema,
});

// CSV import schemas
export const BuyerCsvRowSchema = z.object({
  business_name: z.string().min(1, 'Business name is required'),
  phone: z.string().regex(/^[0-9]{10}$/, 'Phone must be 10 digits'),
  contact_name: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  gstin: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  zone: z.string().optional(),
  tier: z.enum(['A', 'B', 'C']).optional().or(z.literal('')),
  credit_limit: z.coerce.number().nonnegative().default(0),
  payment_terms_days: z.coerce.number().nonnegative().default(0),
  external_ref: z.string().optional(),
});
export type BuyerCsvRow = z.infer<typeof BuyerCsvRowSchema>;

// Custom product schema (master_product_id = null)
export const CustomProductSchema = z.object({
  master_product_id: z.string().uuid().optional().nullable(),
  tenant_brand_id: z.string().uuid('Brand is required').optional(),
  internal_sku: z.string().min(1, 'Internal SKU is required'),
  name: z.string().min(1, 'Product name is required'),
  mrp: z.coerce.number().positive('MRP must be positive'),
  base_selling_price: z.coerce.number().positive('Base selling price must be positive'),
  cost_price: z.coerce.number().positive('Cost price must be positive').optional().nullable(),
  default_uom: z.string().optional(),
  pack_size: z.coerce.number().positive().optional().nullable(),
  hsn_code: z.string().optional(),
  gst_rate: z.coerce.number().min(0).max(100).optional().nullable(),
  description: z.string().optional(),
  category_name: z.string().optional(),
  tenant_category_id: z.string().uuid().optional().nullable(),
  attributes: z.record(z.string()).optional().default({}),
  image_urls: z.array(z.string().url()).optional().default([]),
});
export type CustomProductInput = z.infer<typeof CustomProductSchema>;

// Password flow schemas
export const ForgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

export const SetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;

// Export types
export type InviteUserInput = z.infer<typeof InviteUserSchema>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type BuyerCsvRowInput = z.infer<typeof BuyerCsvRowSchema>;
export type SignUpInput = z.infer<typeof SignUpSchema>;
export type WhatsAppOTPInput = z.infer<typeof WhatsAppOTPSchema>;
export type TenantInput = z.infer<typeof TenantSchema>;
export type BrandInput = z.infer<typeof BrandSchema>;
export type ProductInput = z.infer<typeof ProductSchema>;
export type BuyerInput = z.infer<typeof BuyerSchema>;
export type CohortInput = z.infer<typeof CohortSchema>;
export type PriceListInput = z.infer<typeof PriceListSchema>;
export type PriceListCreateInput = z.infer<typeof PriceListSchema>;
export type PriceListItemInput = z.infer<typeof PriceListItemSchema>;
export type PublishedCatalogInput = z.infer<typeof PublishedCatalogSchema>;
export type OrderInput = z.infer<typeof OrderSchema>;
export type OrderItemInput = z.infer<typeof OrderItemSchema>;
export type CreateBrandInput = z.infer<typeof CreateBrandSchema>;
export type ImportedBrandCreateInput = z.infer<typeof ImportedBrandCreateSchema>;
export type CustomBrandCreateInput = z.infer<typeof CustomBrandCreateSchema>;
export type TenantProductInput = z.infer<typeof TenantProductSchema>;
