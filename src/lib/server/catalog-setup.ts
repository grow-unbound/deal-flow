import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { assembleTenantSettingsPayload } from '@/lib/tenant-settings/assemble-tenant-settings-payload';
import { onboardingSlugify } from '@/lib/onboarding/slugify';
import { isReservedStorefrontLabel } from '@/lib/storefront-host';
import { loadOnboardingPreview, type OnboardingPreviewPayload } from '@/lib/server/onboarding-catalog-preview';
import { revalidatePublicCatalogCache } from '@/lib/server/public-catalog-cache';
import { revalidateTenantSettingsCache } from '@/lib/server/tenant-settings-cache';
import type {
  CatalogAccessMode,
  CatalogPricingMode,
  CatalogProductDisplayMode,
} from '@/lib/server/public-catalog';
import { TenantSettingsPatchSchema, type TenantSettingsApiPayload } from '@/types/tenant-settings';

export const CatalogSetupPricingModeSchema = z.enum([
  'hidden_until_login',
  'hide_price_collect_enquiry',
  'base_selling_rate',
  'assigned_price_list',
]);
export const CatalogSetupAccessModeSchema = z.enum(['public_link', 'approved_buyers_only']);
export const CatalogSetupProductDisplayModeSchema = z.enum(['sku_list', 'group_variants']);

export const CatalogSetupPatchSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/).optional(),
  pricing_mode: CatalogSetupPricingModeSchema.optional(),
  price_list_id: z.string().uuid().nullable().optional(),
  access_mode: CatalogSetupAccessModeSchema.optional(),
  collect_target_unit_price_range: z.boolean().optional(),
  product_display_mode: CatalogSetupProductDisplayModeSchema.optional(),
  settings: TenantSettingsPatchSchema.optional(),
  publish: z.boolean().optional(),
});

export type CatalogSetupPatch = z.infer<typeof CatalogSetupPatchSchema>;

export interface CatalogSetupState extends OnboardingPreviewPayload {
  settings: TenantSettingsApiPayload;
}

type TenantBasicsRow = {
  business_name: string;
  tagline: string | null;
  gstin: string | null;
  primary_state: string | null;
  plan: string | null;
};

export async function loadCatalogSetupState(
  db: SupabaseClient,
  tenantId: string,
  pricingMode?: CatalogPricingMode | null,
  priceListId?: string | null,
): Promise<CatalogSetupState> {
  const [{ data: tenantRow, error: tenantError }, { data: settingsRow, error: settingsError }, preview] = await Promise.all([
    db
      .schema('app')
      .from('tenants')
      .select('business_name, tagline, gstin, primary_state, plan')
      .eq('id', tenantId)
      .maybeSingle(),
    db
      .schema('app')
      .from('tenant_settings')
      .select('settings')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    loadOnboardingPreview(db, tenantId, pricingMode ?? null, priceListId ?? null),
  ]);

  if (tenantError) throw new Error(tenantError.message);
  if (settingsError) throw new Error(settingsError.message);

  const tenant = tenantRow as TenantBasicsRow | null;
  const rawSettings = (settingsRow as { settings?: unknown } | null)?.settings ?? {};
  const settings = await assembleTenantSettingsPayload(db, tenantId, rawSettings, {
    business_name: tenant?.business_name ?? preview.businessName,
    tagline: tenant?.tagline ?? null,
    gstin: tenant?.gstin ?? null,
    primary_state: tenant?.primary_state ?? null,
    plan: tenant?.plan ?? 'starter',
  });

  return { ...preview, settings };
}

export async function saveCatalogSetupState(
  db: SupabaseClient,
  params: {
    tenantId: string;
    actorId: string;
    patch: CatalogSetupPatch;
  },
): Promise<{ slug: string | null }> {
  const { tenantId, actorId, patch } = params;
  const catalogPatch: Record<string, unknown> = {};
  const publishing = patch.publish === true;

  let slug: string | null = null;
  if (patch.slug !== undefined) {
    slug = onboardingSlugify(patch.slug);
    if (!slug || isReservedStorefrontLabel(slug)) {
      throw new CatalogSetupValidationError('That slug is reserved', 400);
    }
    const { data: slugTaken, error: slugError } = await db
      .schema('app')
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .neq('id', tenantId)
      .maybeSingle();
    if (slugError) throw new Error(slugError.message);
    if (slugTaken) throw new CatalogSetupValidationError('That catalog link is already taken', 409);
  }

  const currentRes = await db
    .schema('app')
    .from('catalogs')
    .select('id, pricing_mode, price_list_id, collect_target_unit_price_range')
    .eq('tenant_id', tenantId)
    .eq('kind', 'public')
    .is('deleted_at', null)
    .maybeSingle();
  if (currentRes.error) throw new Error(currentRes.error.message);
  if (!currentRes.data?.id) throw new Error('Public catalog row missing');

  const nextPricingMode = (patch.pricing_mode ?? currentRes.data.pricing_mode ?? null) as CatalogPricingMode | null;
  let nextPriceListId = (currentRes.data.price_list_id as string | null) ?? null;
  if (patch.pricing_mode === 'assigned_price_list') {
    nextPriceListId = patch.price_list_id ?? null;
  } else if (patch.pricing_mode !== undefined) {
    nextPriceListId = null;
  } else if (patch.price_list_id !== undefined) {
    nextPriceListId = patch.price_list_id;
  }
  const nextCollectTarget = patch.collect_target_unit_price_range ?? Boolean(currentRes.data.collect_target_unit_price_range);

  if (publishing && !nextPricingMode) {
    throw new CatalogSetupValidationError('Choose a pricing mode before publishing', 400);
  }
  if (nextPricingMode === 'assigned_price_list' && !nextPriceListId) {
    throw new CatalogSetupValidationError('Pick a price list', 400);
  }
  if (nextCollectTarget && nextPricingMode !== 'hide_price_collect_enquiry') {
    throw new CatalogSetupValidationError('Target unit price range is only available when prices are hidden for enquiries', 400);
  }

  if (patch.pricing_mode !== undefined) {
    catalogPatch.pricing_mode = patch.pricing_mode;
    catalogPatch.price_list_id = patch.pricing_mode === 'assigned_price_list' ? nextPriceListId : null;
  } else if (patch.price_list_id !== undefined) {
    catalogPatch.price_list_id = patch.price_list_id;
  }
  if (patch.access_mode !== undefined) catalogPatch.access_mode = patch.access_mode;
  if (patch.collect_target_unit_price_range !== undefined) {
    catalogPatch.collect_target_unit_price_range = patch.collect_target_unit_price_range;
  }
  if (patch.product_display_mode !== undefined) catalogPatch.product_display_mode = patch.product_display_mode;
  if (publishing) catalogPatch.live_at = new Date().toISOString();

  if (slug) {
    const { error: tenantUpdateError } = await db
      .schema('app')
      .from('tenants')
      .update({ slug, updated_at: new Date().toISOString(), updated_by: actorId })
      .eq('id', tenantId);
    if (tenantUpdateError) throw new Error(tenantUpdateError.message);
  }

  if (Object.keys(catalogPatch).length > 0) {
    const { error: catalogUpdateError } = await db
      .schema('app')
      .from('catalogs')
      .update({ ...catalogPatch, updated_at: new Date().toISOString(), updated_by: actorId })
      .eq('id', currentRes.data.id);
    if (catalogUpdateError) throw new Error(catalogUpdateError.message);
    revalidatePublicCatalogCache(tenantId);
  }

  if (patch.settings) {
    const { error: settingsError } = await db.schema('app').rpc('update_tenant_settings', {
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_patch: patch.settings as Record<string, unknown>,
    });
    if (settingsError) throw new Error(settingsError.message);
    revalidateTenantSettingsCache(tenantId);

    const business = patch.settings.business;
    if (business && Object.keys(business).length > 0) {
      const tenantUpdates: Record<string, string | null> = {};
      if (business.company_name !== undefined) tenantUpdates.business_name = business.company_name;
      if (business.gstin !== undefined) tenantUpdates.gstin = business.gstin.trim() === '' ? null : business.gstin.trim();
      if (business.address?.state !== undefined) {
        tenantUpdates.primary_state = business.address.state.trim() === '' ? null : business.address.state.trim();
      }
      if (business.logo_url !== undefined) tenantUpdates.logo_url = business.logo_url;
      if (Object.keys(tenantUpdates).length > 0) {
        const { error: tenantSettingsSyncError } = await db
          .schema('app')
          .from('tenants')
          .update({ ...tenantUpdates, updated_by: actorId })
          .eq('id', tenantId);
        if (tenantSettingsSyncError) throw new Error(tenantSettingsSyncError.message);
      }
    }
  }

  return { slug };
}

export class CatalogSetupValidationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
