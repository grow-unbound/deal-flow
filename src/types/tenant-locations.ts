import { z } from 'zod';

export const LocationStatusSchema = z.enum(['active', 'inactive']);
export type LocationStatus = z.infer<typeof LocationStatusSchema>;

export const LocationAssociatedUserSchema = z.object({
  email: z.string().trim().email('Valid email required'),
  user_name: z.string().trim().nullable().optional(),
  user_id: z.string().trim().nullable().optional(),
});

export type LocationAssociatedUser = z.infer<typeof LocationAssociatedUserSchema>;

/** Address stored in locations.address JSONB — line1 aligned with tenant_settings business address. */
export const LocationAddressSchema = z.object({
  line1: z.string().max(500).default(''),
  line2: z.string().max(500).default('').optional(),
  city: z.string().max(200).default(''),
  state: z.string().max(2).default(''),
  pincode: z.string().max(10).default(''),
});

export type LocationAddress = z.infer<typeof LocationAddressSchema>;

export const CreateLocationInputSchema = z.object({
  name: z.string().min(1, 'Location name is required').max(200),
  address: LocationAddressSchema.optional(),
  is_default: z.boolean().optional().default(false),
  external_ref: z.string().max(200).optional(),
  phone_number: z.string().trim().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits').nullable().optional(),
  status: LocationStatusSchema.optional().default('active'),
  associated_users: z.array(LocationAssociatedUserSchema).optional().default([]),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type CreateLocationInput = z.infer<typeof CreateLocationInputSchema>;

export const UpdateLocationInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    address: LocationAddressSchema.partial().optional(),
    is_default: z.boolean().optional(),
    external_ref: z.string().max(200).nullable().optional(),
    phone_number: z.string().trim().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits').nullable().optional(),
    status: LocationStatusSchema.optional(),
    associated_users: z.array(LocationAssociatedUserSchema).optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    /** When true, clears deleted_at (seller_admin only). */
    reactivate: z.boolean().optional(),
  })
  .strict();

export type UpdateLocationInput = z.infer<typeof UpdateLocationInputSchema>;

export interface TenantLocation {
  id: string;
  tenant_id: string;
  name: string;
  address: LocationAddress;
  phone_number: string | null;
  status: LocationStatus;
  is_default: boolean;
  external_ref: string | null;
  associated_users: LocationAssociatedUser[];
  lat: number | null;
  lng: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
