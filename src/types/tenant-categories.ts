import { z } from 'zod';

export const CreateCategoryInputSchema = z.object({
  name: z.string().min(1, 'Category name is required').max(200),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers and hyphens'),
  description: z.string().max(2000).optional(),
  display_order: z.number().int().min(0).default(0),
  external_ref: z.string().max(200).optional(),
  r2_image_original_key: z.string().optional(),
  r2_image_medium_key: z.string().optional(),
  r2_image_thumb_key: z.string().optional(),
});

export type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>;

export const UpdateCategoryInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers and hyphens')
      .optional(),
    description: z.string().max(2000).nullable().optional(),
    display_order: z.number().int().min(0).optional(),
    external_ref: z.string().max(200).nullable().optional(),
    is_active: z.boolean().optional(),
    r2_image_original_key: z.string().nullable().optional(),
    r2_image_medium_key: z.string().nullable().optional(),
    r2_image_thumb_key: z.string().nullable().optional(),
    reactivate: z.boolean().optional(),
  })
  .strict();

export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInputSchema>;

export interface TenantCategory {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  external_ref: string | null;
  is_active: boolean;
  deleted_at: string | null;
  r2_image_original_key: string | null;
  r2_image_medium_key: string | null;
  r2_image_thumb_key: string | null;
  created_at: string;
  updated_at: string;
}
