import { z } from 'zod';

export const LocationTypeSchema = z.enum(['warehouse', 'dispatch_point', 'branch']);
export type LocationType = z.infer<typeof LocationTypeSchema>;

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
  type: LocationTypeSchema.optional().default('warehouse'),
  address: LocationAddressSchema.optional(),
  inventory_tracking: z.boolean().optional().default(true),
  is_default: z.boolean().optional().default(false),
  external_ref: z.string().max(200).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type CreateLocationInput = z.infer<typeof CreateLocationInputSchema>;

export const UpdateLocationInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    type: LocationTypeSchema.optional(),
    address: LocationAddressSchema.partial().optional(),
    inventory_tracking: z.boolean().optional(),
    is_default: z.boolean().optional(),
    external_ref: z.string().max(200).nullable().optional(),
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
  type: LocationType;
  address: LocationAddress;
  inventory_tracking: boolean;
  is_default: boolean;
  external_ref: string | null;
  lat: number | null;
  lng: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
