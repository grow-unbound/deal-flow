import type { JWTClaims } from '@/lib/auth';
import { BrandCreateSchema, type BrandCreateInput } from '@/lib/zod';

export interface TenantBrandCreateError {
  status: number;
  error: string;
  details?: unknown;
}

type DbClient = any;

function emptyToNull(value?: string | null) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableNumber(value?: number | null) {
  return value == null || Number.isNaN(value) ? null : value;
}

function buildTenantBrandInsert(
  input: BrandCreateInput,
  tenantId: string,
  actorId: string | null,
  options: {
    masterBrandId?: string | null;
    displayName: string;
    slug?: string | null;
    description?: string | null;
    logoUrl?: string | null;
  },
) {
  return {
    tenant_id: tenantId,
    master_brand_id: options.masterBrandId ?? null,
    display_name_override: emptyToNull(options.displayName),
    slug: emptyToNull(options.slug),
    description: emptyToNull(options.description),
    logo_url: emptyToNull(options.logoUrl),
    margin_pct: nullableNumber(input.margin_pct),
    exclusivity: input.exclusivity ?? false,
    external_ref: emptyToNull(input.external_ref),
    principal_name: emptyToNull(input.principal_name),
    principal_email: emptyToNull(input.principal_email),
    principal_phone: emptyToNull(input.principal_phone),
    principal_location: emptyToNull(input.principal_location),
    contact_name: emptyToNull(input.contact_name),
    contact_email: emptyToNull(input.contact_email),
    contact_phone: emptyToNull(input.contact_phone),
    default_cohort_id: input.default_cohort_id ?? null,
    is_active: true,
    created_by: actorId,
    updated_by: actorId,
  };
}

async function validateDefaultCohort(db: DbClient, tenantId: string, defaultCohortId?: string | null) {
  if (!defaultCohortId) return;

  const { data: cohort, error } = await db
    .schema('app')
    .from('cohorts')
    .select('id')
    .eq('id', defaultCohortId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !cohort) {
    throw {
      status: 400,
      error: 'Selected cohort is invalid for this tenant.',
    } satisfies TenantBrandCreateError;
  }
}

export async function createTenantBrand(
  db: DbClient,
  claims: JWTClaims,
  body: unknown,
) {
  const parsed = BrandCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw {
      status: 400,
      error: 'Invalid request body',
      details: parsed.error.flatten(),
    } satisfies TenantBrandCreateError;
  }

  if (!claims.tenant_id) {
    throw {
      status: 401,
      error: 'Unauthorized',
    } satisfies TenantBrandCreateError;
  }

  await validateDefaultCohort(db, claims.tenant_id, parsed.data.default_cohort_id);

  const actorId = claims.sub ?? claims.tenant_id;

  if (parsed.data.mode === 'import') {
    const { data: masterBrand, error: masterBrandError } = await db
      .schema('catalog')
      .from('brands')
      .select('id, name, slug, logo_url, description')
      .eq('id', parsed.data.master_brand_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (masterBrandError || !masterBrand) {
      throw {
        status: 404,
        error: 'Brand not found in master catalog',
      } satisfies TenantBrandCreateError;
    }

    const { data: existing } = await db
      .schema('app')
      .from('tenant_brands')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('master_brand_id', parsed.data.master_brand_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      throw {
        status: 409,
        error: 'Brand already in your catalog',
      } satisfies TenantBrandCreateError;
    }

    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('tenant_brands')
      .insert(
        buildTenantBrandInsert(parsed.data, claims.tenant_id, actorId, {
          masterBrandId: parsed.data.master_brand_id,
          displayName:
            emptyToNull(parsed.data.display_name_override) ??
            emptyToNull(parsed.data.name) ??
            masterBrand.name,
          slug: parsed.data.slug ?? masterBrand.slug,
          description: parsed.data.description ?? masterBrand.description,
          logoUrl: emptyToNull(parsed.data.logo_url) ?? masterBrand.logo_url,
        }),
      )
      .select('*')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw {
          status: 409,
          error: 'Brand already in your catalog',
        } satisfies TenantBrandCreateError;
      }

      throw {
        status: 500,
        error: 'Failed to add brand',
        details: insertError,
      } satisfies TenantBrandCreateError;
    }

    return {
      brand: {
        ...inserted,
        master_brand: masterBrand ?? null,
      },
    };
  }

  const { data: existingCustomBrand } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id')
    .eq('tenant_id', claims.tenant_id)
    .eq('slug', parsed.data.slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingCustomBrand) {
    throw {
      status: 409,
      error: 'A brand with this slug already exists.',
    } satisfies TenantBrandCreateError;
  }

  const { data: tenantBrand, error: tenantBrandError } = await db
    .schema('app')
    .from('tenant_brands')
    .insert(
      buildTenantBrandInsert(parsed.data, claims.tenant_id, actorId, {
        masterBrandId: null,
        displayName: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description,
        logoUrl: parsed.data.logo_url,
      }),
    )
    .select('*')
    .single();

  if (tenantBrandError) {
    if (tenantBrandError.code === '23505') {
      throw {
        status: 409,
        error: 'A brand with this slug already exists.',
      } satisfies TenantBrandCreateError;
    }

    throw {
      status: 500,
      error: 'Failed to create brand',
      details: tenantBrandError,
    } satisfies TenantBrandCreateError;
  }

  return {
    brand: {
      ...tenantBrand,
      master_brand: null,
    },
  };
}
