type DbClient = any;

type CatalogBrandSource = {
  id: string;
  name: string;
  slug: string;
};

type CatalogCategorySource = {
  id: string;
  name: string;
  slug: string;
};

type CatalogProductSource = {
  id: string;
  brand_id: string | null;
  category_id: string | null;
  brands: CatalogBrandSource | null;
  categories: CatalogCategorySource | null;
};

export type ImportedProductTenantLinks = {
  tenant_brand_id: string | null;
  tenant_category_id: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function catalogSlugCandidates(sourceSlug: string, sourceName: string) {
  return Array.from(
    new Set(
      [sourceSlug, slugify(sourceName)]
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

async function loadCatalogProductSource(db: DbClient, masterProductId: string): Promise<CatalogProductSource | null> {
  const { data, error } = await db
    .schema('catalog')
    .from('products')
    .select('id, brand_id, category_id, brands(id, name, slug), categories(id, name, slug)')
    .eq('id', masterProductId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as CatalogProductSource | null;
}

async function ensureTenantBrandForCatalogBrand(
  db: DbClient,
  tenantId: string,
  actorId: string | null,
  sourceBrand: CatalogBrandSource,
  preferredTenantBrandId?: string | null,
) {
  if (preferredTenantBrandId) {
    const { data: preferredBrand, error } = await db
      .schema('app')
      .from('tenant_brands')
      .select('id')
      .eq('id', preferredTenantBrandId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    if (preferredBrand) return preferredBrand.id as string;
  }

  const candidateSlugs = catalogSlugCandidates(sourceBrand.slug, sourceBrand.name);

  const { data: byMaster, error: masterError } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('master_brand_id', sourceBrand.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (masterError) throw masterError;
  if (byMaster) return byMaster.id as string;

  const { data: bySlug, error: slugError } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .in('slug', candidateSlugs)
    .maybeSingle();

  if (slugError) throw slugError;
  if (bySlug) return bySlug.id as string;

  const { data: inserted, error: insertError } = await db
    .schema('app')
    .from('tenant_brands')
    .insert({
      tenant_id: tenantId,
      master_brand_id: sourceBrand.id,
      display_name_override: sourceBrand.name,
      slug: candidateSlugs[0] ?? slugify(sourceBrand.name),
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raceWinnerByMaster } = await db
        .schema('app')
        .from('tenant_brands')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('master_brand_id', sourceBrand.id)
        .is('deleted_at', null)
        .maybeSingle();

      if (raceWinnerByMaster) return raceWinnerByMaster.id as string;

      const { data: raceWinnerBySlug } = await db
        .schema('app')
        .from('tenant_brands')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('slug', candidateSlugs)
        .maybeSingle();

      if (raceWinnerBySlug) return raceWinnerBySlug.id as string;
    }

    throw insertError;
  }

  return inserted?.id as string;
}

async function ensureTenantCategoryForCatalogCategory(
  db: DbClient,
  tenantId: string,
  actorId: string | null,
  sourceCategory: CatalogCategorySource,
  preferredTenantCategoryId?: string | null,
) {
  if (preferredTenantCategoryId) {
    const { data: preferredCategory, error } = await db
      .schema('app')
      .from('tenant_categories')
      .select('id')
      .eq('id', preferredTenantCategoryId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    if (preferredCategory) return preferredCategory.id as string;
  }

  const candidateSlugs = catalogSlugCandidates(sourceCategory.slug, sourceCategory.name);

  const { data: byMaster, error: masterError } = await db
    .schema('app')
    .from('tenant_categories')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('master_category_id', sourceCategory.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (masterError) throw masterError;
  if (byMaster) return byMaster.id as string;

  const { data: bySlug, error: slugError } = await db
    .schema('app')
    .from('tenant_categories')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .in('slug', candidateSlugs)
    .maybeSingle();

  if (slugError) throw slugError;
  if (bySlug) return bySlug.id as string;

  const { data: inserted, error: insertError } = await db
    .schema('app')
    .from('tenant_categories')
    .insert({
      tenant_id: tenantId,
      master_category_id: sourceCategory.id,
      name: sourceCategory.name,
      slug: candidateSlugs[0] ?? slugify(sourceCategory.name),
      review_status: 'draft',
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raceWinnerByMaster } = await db
        .schema('app')
        .from('tenant_categories')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('master_category_id', sourceCategory.id)
        .is('deleted_at', null)
        .maybeSingle();

      if (raceWinnerByMaster) return raceWinnerByMaster.id as string;

      const { data: raceWinnerBySlug } = await db
        .schema('app')
        .from('tenant_categories')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('slug', candidateSlugs)
        .maybeSingle();

      if (raceWinnerBySlug) return raceWinnerBySlug.id as string;
    }

    throw insertError;
  }

  return inserted?.id as string;
}

export async function resolveImportedProductTenantLinks(
  db: DbClient,
  tenantId: string,
  actorId: string | null,
  masterProductId: string,
  options: {
    tenant_brand_id?: string | null;
    tenant_category_id?: string | null;
  } = {},
): Promise<ImportedProductTenantLinks | null> {
  const source = await loadCatalogProductSource(db, masterProductId);
  if (!source) return null;

  const [tenantBrandId, tenantCategoryId] = await Promise.all([
    source.brands
      ? ensureTenantBrandForCatalogBrand(db, tenantId, actorId, source.brands, options.tenant_brand_id)
      : Promise.resolve(options.tenant_brand_id ?? null),
    source.categories
      ? ensureTenantCategoryForCatalogCategory(db, tenantId, actorId, source.categories, options.tenant_category_id)
      : Promise.resolve(options.tenant_category_id ?? null),
  ]);

  return {
    tenant_brand_id: tenantBrandId ?? null,
    tenant_category_id: tenantCategoryId ?? null,
  };
}
