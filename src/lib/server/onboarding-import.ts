import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportAnomaly, OnboardingImportRow } from '@/lib/onboarding/types';
import { detectRowAnomalies, uniqueSlugForName } from '@/lib/onboarding/import-rows';
import { onboardingSlugify } from '@/lib/onboarding/slugify';

const UNBRANDED_SLUG = 'unbranded';

type DbClient = SupabaseClient;

export interface OnboardingImportSummary {
  imported: number;
  updated: number;
  failed: number;
  anomalies: ImportAnomaly[];
}

interface BrandRow {
  id: string;
  slug: string | null;
  display_name_override: string | null;
}

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
}

async function loadBrands(db: DbClient, tenantId: string): Promise<{
  bySlug: Map<string, string>;
  byName: Map<string, string>;
  taken: Set<string>;
}> {
  const { data, error } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id, slug, display_name_override')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .limit(5000);

  if (error) throw new Error(error.message);

  const bySlug = new Map<string, string>();
  const byName = new Map<string, string>();
  const taken = new Set<string>();
  for (const row of (data ?? []) as BrandRow[]) {
    if (row.slug) {
      bySlug.set(row.slug, row.id);
      taken.add(row.slug);
    }
    const name = row.display_name_override?.trim().toLowerCase();
    if (name) byName.set(name, row.id);
  }
  return { bySlug, byName, taken };
}

async function loadCategories(db: DbClient, tenantId: string): Promise<{
  bySlug: Map<string, string>;
  byName: Map<string, string>;
  taken: Set<string>;
}> {
  const { data, error } = await db
    .schema('app')
    .from('tenant_categories')
    .select('id, slug, name')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .limit(5000);

  if (error) throw new Error(error.message);

  const bySlug = new Map<string, string>();
  const byName = new Map<string, string>();
  const taken = new Set<string>();
  for (const row of (data ?? []) as CategoryRow[]) {
    bySlug.set(row.slug, row.id);
    taken.add(row.slug);
    byName.set(row.name.trim().toLowerCase(), row.id);
  }
  return { bySlug, byName, taken };
}

async function insertBrand(
  db: DbClient,
  tenantId: string,
  actorId: string,
  name: string,
  slug: string,
): Promise<string> {
  const { data, error } = await db
    .schema('app')
    .from('tenant_brands')
    .insert({
      tenant_id: tenantId,
      master_brand_id: null,
      display_name_override: name,
      slug,
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await db
        .schema('app')
        .from('tenant_brands')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle();
      if (existing?.id) return existing.id as string;
    }
    throw new Error(error.message);
  }

  return data.id as string;
}

async function insertCategory(
  db: DbClient,
  tenantId: string,
  actorId: string,
  name: string,
  slug: string,
): Promise<string> {
  const { data, error } = await db
    .schema('app')
    .from('tenant_categories')
    .insert({
      tenant_id: tenantId,
      name,
      slug,
      review_status: 'draft',
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await db
        .schema('app')
        .from('tenant_categories')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle();
      if (existing?.id) return existing.id as string;
    }
    throw new Error(error.message);
  }

  return data.id as string;
}

async function resolveBrandId(
  db: DbClient,
  tenantId: string,
  actorId: string,
  brandName: string | undefined,
  brands: Awaited<ReturnType<typeof loadBrands>>,
): Promise<string> {
  if (!brandName?.trim()) {
    const existing = brands.bySlug.get(UNBRANDED_SLUG);
    if (existing) return existing;
    const id = await insertBrand(db, tenantId, actorId, 'Unbranded', UNBRANDED_SLUG);
    brands.bySlug.set(UNBRANDED_SLUG, id);
    brands.byName.set('unbranded', id);
    brands.taken.add(UNBRANDED_SLUG);
    return id;
  }

  const trimmed = brandName.trim();
  const byName = brands.byName.get(trimmed.toLowerCase());
  if (byName) return byName;

  const preferred = onboardingSlugify(trimmed) || 'brand';
  const bySlug = brands.bySlug.get(preferred);
  if (bySlug) {
    brands.byName.set(trimmed.toLowerCase(), bySlug);
    return bySlug;
  }

  const slug = uniqueSlugForName(trimmed, brands.taken);
  const id = await insertBrand(db, tenantId, actorId, trimmed, slug);
  brands.bySlug.set(slug, id);
  brands.byName.set(trimmed.toLowerCase(), id);
  return id;
}

async function resolveCategoryId(
  db: DbClient,
  tenantId: string,
  actorId: string,
  categoryName: string | undefined,
  categories: Awaited<ReturnType<typeof loadCategories>>,
): Promise<string | null> {
  if (!categoryName?.trim()) return null;

  const trimmed = categoryName.trim();
  const byName = categories.byName.get(trimmed.toLowerCase());
  if (byName) return byName;

  const preferred = onboardingSlugify(trimmed) || 'category';
  const bySlug = categories.bySlug.get(preferred);
  if (bySlug) {
    categories.byName.set(trimmed.toLowerCase(), bySlug);
    return bySlug;
  }

  const slug = uniqueSlugForName(trimmed, categories.taken);
  const id = await insertCategory(db, tenantId, actorId, trimmed, slug);
  categories.bySlug.set(slug, id);
  categories.byName.set(trimmed.toLowerCase(), id);
  return id;
}

export async function runOnboardingImportChunk(
  db: DbClient,
  tenantId: string,
  actorId: string,
  rows: OnboardingImportRow[],
  isSellerAdmin: boolean,
): Promise<OnboardingImportSummary> {
  const brands = await loadBrands(db, tenantId);
  const categories = await loadCategories(db, tenantId);

  const skuCounts = new Map<string, number>();
  for (const row of rows) {
    skuCounts.set(row.internal_sku, (skuCounts.get(row.internal_sku) ?? 0) + 1);
  }

  const { data: existingProducts } = await db
    .schema('app')
    .from('tenant_products')
    .select('internal_sku')
    .eq('tenant_id', tenantId)
    .limit(20_000);

  const existingSkuSet = new Set(
    (existingProducts ?? []).map((r: { internal_sku: string }) => r.internal_sku),
  );

  let imported = 0;
  let updated = 0;
  let failed = 0;
  const anomalies: ImportAnomaly[] = [];

  for (const row of rows) {
    try {
      const duplicateInFile = (skuCounts.get(row.internal_sku) ?? 0) > 1;
      const rowAnomalies = detectRowAnomalies(row, duplicateInFile);

      const tenant_brand_id = await resolveBrandId(db, tenantId, actorId, row.brand, brands);
      const tenant_category_id = await resolveCategoryId(db, tenantId, actorId, row.category, categories);
      const wasExisting = existingSkuSet.has(row.internal_sku);

      const payload: Record<string, unknown> = {
        tenant_id: tenantId,
        tenant_brand_id,
        tenant_category_id,
        master_product_id: null,
        internal_sku: row.internal_sku,
        name_override: row.name,
        mrp: row.mrp ?? null,
        base_selling_price: row.base_selling_price ?? null,
        gst_rate: row.gst_rate ?? null,
        hsn_code: row.hsn_code ?? null,
        cost_price: isSellerAdmin ? (row.cost_price ?? null) : null,
        default_uom: row.default_uom ?? null,
        pack_size: row.pack_size ?? null,
        description: row.description ?? null,
        is_active: true,
        deleted_at: null,
        updated_by: actorId,
      };

      if (!wasExisting) {
        payload.created_by = actorId;
        payload.attributes_override = {};
        payload.image_urls = [];
      }

      const { data: upserted, error } = await db
        .schema('app')
        .from('tenant_products')
        .upsert(payload, { onConflict: 'tenant_id,internal_sku' })
        .select('id')
        .single();

      if (error) {
        failed += 1;
        anomalies.push({
          sku: row.internal_sku,
          productName: row.name,
          kind: 'missing_name',
          message: error.message,
        });
        continue;
      }

      if (wasExisting) updated += 1;
      else {
        imported += 1;
        existingSkuSet.add(row.internal_sku);
      }

      for (const anomaly of rowAnomalies) {
        anomalies.push({
          ...anomaly,
          productId: upserted?.id as string | undefined,
        });
      }
    } catch (err) {
      failed += 1;
      anomalies.push({
        sku: row.internal_sku,
        productName: row.name,
        kind: 'missing_name',
        message: err instanceof Error ? err.message : 'Import failed',
      });
    }
  }

  return { imported, updated, failed, anomalies };
}
