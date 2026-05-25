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

// Brand schemas
export const BrandSchema = z.object({
  name: z.string().min(1, 'Brand name is required'),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric'),
  description: z.string().optional(),
  logo_url: z.string().url().optional(),
  external_ref: z.string().optional(),
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

// Price list schemas
export const PriceListSchema = z.object({
  name: z.string().min(1, 'Price list name is required'),
  currency: z.string().default('INR'),
  valid_from: z.coerce.date(),
  valid_to: z.coerce.date().optional(),
  priority: z.coerce.number().default(0),
});

export const PriceListItemSchema = z.object({
  price: z.coerce.number().positive('Price must be positive'),
  min_qty: z.coerce.number().default(1),
  max_qty: z.coerce.number().optional(),
});

// Catalog schemas
export const PublishedCatalogSchema = z.object({
  name: z.string().min(1, 'Catalog name is required'),
  scope_type: z.enum(['cohort', 'buyer', 'geography', 'all']),
  valid_from: z.coerce.date(),
  valid_to: z.coerce.date().optional(),
  hero_image_url: z.string().url().optional(),
  message: z.string().optional(),
});

// Order schemas
export const OrderSchema = z.object({
  buyer_id: z.string().uuid('Invalid buyer ID'),
  notes: z.string().optional(),
});

export const OrderItemSchema = z.object({
  tenant_product_id: z.string().uuid('Invalid product ID'),
  qty: z.coerce.number().positive('Quantity must be positive'),
});

// Team invite schemas
export const InviteUserSchema = z.object({
  email: z.string().email('Valid email required'),
  role: z.enum(['seller_admin', 'seller_assistant']),
});

export const UpdateMemberRoleSchema = z.object({
  role: z.enum(['seller_admin', 'seller_assistant']),
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

// Export types
export type InviteUserInput = z.infer<typeof InviteUserSchema>;
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
export type PriceListItemInput = z.infer<typeof PriceListItemSchema>;
export type PublishedCatalogInput = z.infer<typeof PublishedCatalogSchema>;
export type OrderInput = z.infer<typeof OrderSchema>;
export type OrderItemInput = z.infer<typeof OrderItemSchema>;
