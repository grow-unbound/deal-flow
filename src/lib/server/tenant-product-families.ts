import type { SupabaseClient } from '@supabase/supabase-js';
import { onboardingSlugify } from '@/lib/onboarding/slugify';

type DbClient = SupabaseClient;

type FamilyAxis = {
  key: string;
  label: string;
  sort: string[];
};

export interface EnsureProductFamilyInput {
  tenantId: string;
  actorId: string;
  tenantProductId: string;
  productName: string;
  familyName?: string | null;
  tenantBrandId: string | null;
  tenantCategoryId: string | null;
  description?: string | null;
  imageUrls?: string[] | null;
  r2OriginalKey?: string | null;
  r2LargeKey?: string | null;
  r2MediumKey?: string | null;
  r2SmallKey?: string | null;
  r2ThumbKey?: string | null;
  variantAttributes?: Record<string, string> | null;
}

function familyExternalRef(input: EnsureProductFamilyInput): string {
  const hasGroupingIntent = Boolean(input.familyName?.trim()) || Object.keys(input.variantAttributes ?? {}).length > 0;
  if (!hasGroupingIntent) return `tenant_product:${input.tenantProductId}`;

  const familyName = input.familyName?.trim() || input.productName.trim() || 'Product';
  const slug = onboardingSlugify(familyName) || 'product-family';
  return [
    'import-family',
    input.tenantBrandId ?? 'no-brand',
    input.tenantCategoryId ?? 'no-category',
    slug,
  ].join(':');
}

function toAxis(key: string, value: string): FamilyAxis {
  return { key, label: key, sort: value ? [value] : [] };
}

function mergeVariantAxes(current: unknown, attrs: Record<string, string> | null | undefined): FamilyAxis[] {
  const axes = Array.isArray(current) ? current.filter((axis): axis is FamilyAxis => {
    return Boolean(axis && typeof axis === 'object' && typeof (axis as FamilyAxis).key === 'string');
  }) : [];
  const byKey = new Map(axes.map((axis) => [axis.key, {
    key: axis.key,
    label: axis.label || axis.key,
    sort: Array.isArray(axis.sort) ? [...axis.sort] : [],
  }]));

  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (!value) continue;
    const axis = byKey.get(key) ?? toAxis(key, value);
    if (!axis.sort?.includes(value)) axis.sort = [...(axis.sort ?? []), value];
    byKey.set(key, axis);
  }

  return [...byKey.values()];
}

export async function ensureTenantProductFamily(
  db: DbClient,
  input: EnsureProductFamilyInput,
): Promise<string> {
  const externalRef = familyExternalRef(input);
  const displayName = input.familyName?.trim() || input.productName.trim() || 'Product';

  const { data: existing, error: existingError } = await db
    .schema('app')
    .from('tenant_product_families')
    .select('id, variant_axes, image_urls, r2_original_key, r2_large_key, r2_medium_key, r2_small_key, r2_thumb_key')
    .eq('tenant_id', input.tenantId)
    .eq('external_ref', externalRef)
    .is('deleted_at', null)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const nextAxes = mergeVariantAxes((existing as { variant_axes?: unknown } | null)?.variant_axes, input.variantAttributes);
  const imageUrls = input.imageUrls ?? [];

  if (existing?.id) {
    const patch: Record<string, unknown> = {
      variant_axes: nextAxes,
      updated_by: input.actorId,
    };
    if (!existing.image_urls?.length && imageUrls.length > 0) patch.image_urls = imageUrls;
    if (!existing.r2_original_key && input.r2OriginalKey) patch.r2_original_key = input.r2OriginalKey;
    if (!existing.r2_large_key && input.r2LargeKey) patch.r2_large_key = input.r2LargeKey;
    if (!existing.r2_medium_key && input.r2MediumKey) patch.r2_medium_key = input.r2MediumKey;
    if (!existing.r2_small_key && input.r2SmallKey) patch.r2_small_key = input.r2SmallKey;
    if (!existing.r2_thumb_key && input.r2ThumbKey) patch.r2_thumb_key = input.r2ThumbKey;

    const { error: updateError } = await db
      .schema('app')
      .from('tenant_product_families')
      .update(patch)
      .eq('id', existing.id);
    if (updateError) throw new Error(updateError.message);
    return existing.id as string;
  }

  const { data: inserted, error: insertError } = await db
    .schema('app')
    .from('tenant_product_families')
    .insert({
      tenant_id: input.tenantId,
      tenant_brand_id: input.tenantBrandId,
      tenant_category_id: input.tenantCategoryId,
      name: displayName,
      description: input.description ?? null,
      variant_axes: nextAxes,
      image_urls: imageUrls,
      r2_original_key: input.r2OriginalKey ?? null,
      r2_large_key: input.r2LargeKey ?? null,
      r2_medium_key: input.r2MediumKey ?? null,
      r2_small_key: input.r2SmallKey ?? null,
      r2_thumb_key: input.r2ThumbKey ?? null,
      is_active: true,
      external_ref: externalRef,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select('id')
    .single();
  if (insertError || !inserted?.id) throw new Error(insertError?.message ?? 'Failed to create product family');
  return inserted.id as string;
}
