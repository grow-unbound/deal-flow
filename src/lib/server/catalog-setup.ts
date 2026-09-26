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
export const CatalogSetupPlaceSchema = z.object({
  label: z.string().max(500).optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  address: z.object({
    line1: z.string().max(500).default(''),
    line2: z.string().max(500).default('').optional(),
    city: z.string().max(200).default(''),
    state: z.string().max(2).default(''),
    pincode: z.string().max(10).default(''),
  }),
});

export const CatalogSetupPatchSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/).optional(),
  pricing_mode: CatalogSetupPricingModeSchema.optional(),
  price_list_id: z.string().uuid().nullable().optional(),
  access_mode: CatalogSetupAccessModeSchema.optional(),
  collect_target_unit_price_range: z.boolean().optional(),
  product_display_mode: CatalogSetupProductDisplayModeSchema.optional(),
  settings: TenantSettingsPatchSchema.optional(),
  setup_place: CatalogSetupPlaceSchema.optional(),
  publish: z.boolean().optional(),
});

export type CatalogSetupPatch = z.infer<typeof CatalogSetupPatchSchema>;

export interface CatalogSetupState extends OnboardingPreviewPayload {
  settings: TenantSettingsApiPayload;
  brandRestrictionSummary: CatalogBrandRestrictionSummary;
}

export interface CatalogBrandRestrictionSummary {
  totalCustomerGroups: number;
  restrictedCustomerGroups: number;
  restrictedBrandCount: number;
  sampleCustomerGroups: string[];
}

type TenantBasicsRow = {
  business_name: string;
  tagline: string | null;
  gstin: string | null;
  primary_state: string | null;
  plan: string | null;
};

const ONBOARDING_DEFAULT_LOCATION_REF = 'yukti:onboarding:default-location';
const ONBOARDING_DEFAULT_WAREHOUSE_REF = 'yukti:onboarding:default-warehouse';

export async function loadCatalogSetupState(
  db: SupabaseClient,
  tenantId: string,
  pricingMode?: CatalogPricingMode | null,
  priceListId?: string | null,
): Promise<CatalogSetupState> {
  const [
    { data: tenantRow, error: tenantError },
    { data: settingsRow, error: settingsError },
    preview,
    brandRestrictionSummary,
  ] = await Promise.all([
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
    loadCatalogBrandRestrictionSummary(db, tenantId),
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

  return { ...preview, settings, brandRestrictionSummary };
}

async function loadCatalogBrandRestrictionSummary(
  db: SupabaseClient,
  tenantId: string,
): Promise<CatalogBrandRestrictionSummary> {
  const { data, error } = await db
    .schema('app')
    .from('cohorts')
    .select('name, allowed_tenant_brand_ids')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .limit(500);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    name: string | null;
    allowed_tenant_brand_ids: string[] | null;
  }>;
  const restricted = rows.filter((row) => row.allowed_tenant_brand_ids !== null);
  const brandIds = new Set<string>();
  for (const row of restricted) {
    for (const brandId of row.allowed_tenant_brand_ids ?? []) {
      brandIds.add(brandId);
    }
  }

  return {
    totalCustomerGroups: rows.length,
    restrictedCustomerGroups: restricted.length,
    restrictedBrandCount: brandIds.size,
    sampleCustomerGroups: restricted.slice(0, 3).map((row) => row.name || 'Unnamed group'),
  };
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
  const catalogUpdatedAt = new Date().toISOString();
  if (publishing) catalogPatch.live_at = catalogUpdatedAt;

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
      .update({ ...catalogPatch, updated_at: catalogUpdatedAt, updated_by: actorId })
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
      if (business.tagline !== undefined) tenantUpdates.tagline = business.tagline.trim() === '' ? null : business.tagline.trim();
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

  if (patch.setup_place) {
    await ensureOnboardingDefaultLocationAndWarehouse(db, {
      tenantId,
      actorId,
      businessName: extractBusinessName(patch.settings?.business?.company_name),
      businessPhone: extractBusinessPhone(patch.settings?.business?.phone),
      place: patch.setup_place,
    });
  }

  return { slug };
}

function extractBusinessName(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractBusinessPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const phone = value.replace(/\D/g, '').slice(0, 10);
  return phone.length === 10 ? phone : null;
}

async function ensureOnboardingDefaultLocationAndWarehouse(
  db: SupabaseClient,
  params: {
    tenantId: string;
    actorId: string;
    businessName: string | null;
    businessPhone: string | null;
    place: z.infer<typeof CatalogSetupPlaceSchema>;
  },
) {
  const now = new Date().toISOString();
  const address = {
    line1: params.place.address.line1.trim(),
    line2: (params.place.address.line2 ?? '').trim(),
    city: params.place.address.city.trim(),
    state: params.place.address.state.trim().toUpperCase().slice(0, 2),
    pincode: params.place.address.pincode.trim(),
  };
  const lat = params.place.lat ?? null;
  const lng = params.place.lng ?? null;
  const locationName = params.businessName ? `${params.businessName} Office` : 'Main Office';
  const warehouseName = params.businessName ? `${params.businessName} Warehouse` : 'Main Warehouse';

  await db
    .schema('app')
    .from('locations')
    .update({ is_default: false, updated_at: now, updated_by: params.actorId })
    .eq('tenant_id', params.tenantId)
    .eq('is_default', true)
    .is('deleted_at', null);

  const { data: existingLocation, error: existingLocationError } = await db
    .schema('app')
    .from('locations')
    .select('id')
    .eq('tenant_id', params.tenantId)
    .eq('external_ref', ONBOARDING_DEFAULT_LOCATION_REF)
    .maybeSingle();
  if (existingLocationError) throw new Error(existingLocationError.message);

  let locationId = (existingLocation as { id?: string } | null)?.id ?? null;
  const locationPayload = {
    tenant_id: params.tenantId,
    name: locationName,
    address,
    is_default: true,
    external_ref: ONBOARDING_DEFAULT_LOCATION_REF,
    phone_number: params.businessPhone,
    status: 'active',
    associated_users: [],
    lat,
    lng,
    deleted_at: null,
    updated_at: now,
    updated_by: params.actorId,
  };

  if (locationId) {
    const { error: updateLocationError } = await db
      .schema('app')
      .from('locations')
      .update(locationPayload)
      .eq('id', locationId);
    if (updateLocationError) throw new Error(updateLocationError.message);
  } else {
    const { data: insertedLocation, error: insertLocationError } = await db
      .schema('app')
      .from('locations')
      .insert({
        ...locationPayload,
        created_by: params.actorId,
      })
      .select('id')
      .single();
    if (insertLocationError) throw new Error(insertLocationError.message);
    locationId = (insertedLocation as { id?: string } | null)?.id ?? null;
  }

  if (!locationId) {
    throw new Error('Failed to create default location');
  }

  const { data: existingWarehouse, error: existingWarehouseError } = await db
    .schema('app')
    .from('warehouses')
    .select('id')
    .eq('tenant_id', params.tenantId)
    .eq('external_ref', ONBOARDING_DEFAULT_WAREHOUSE_REF)
    .maybeSingle();
  if (existingWarehouseError) throw new Error(existingWarehouseError.message);

  const warehouseId = (existingWarehouse as { id?: string } | null)?.id ?? null;
  const warehousePayload = {
    tenant_id: params.tenantId,
    location_id: locationId,
    name: warehouseName,
    address,
    phone_number: params.businessPhone,
    status: 'active',
    is_default: true,
    external_ref: ONBOARDING_DEFAULT_WAREHOUSE_REF,
    associated_users: [],
    lat,
    lng,
    deleted_at: null,
    updated_at: now,
    updated_by: params.actorId,
  };

  if (warehouseId) {
    const { error: updateWarehouseError } = await db
      .schema('app')
      .from('warehouses')
      .update(warehousePayload)
      .eq('id', warehouseId);
    if (updateWarehouseError) throw new Error(updateWarehouseError.message);
  } else {
    const { error: insertWarehouseError } = await db
      .schema('app')
      .from('warehouses')
      .insert({
        ...warehousePayload,
        created_by: params.actorId,
      });
    if (insertWarehouseError) throw new Error(insertWarehouseError.message);
  }
}

export class CatalogSetupValidationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
