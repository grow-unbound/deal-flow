import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { createTimer } from '@/lib/server-timing';
import { CohortCreateSchema, CustomerGroupFormPayloadSchema } from '@/lib/zod';
import { resolveAllBuyerIdsForRules } from '@/lib/server/cohort-composer';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { readArrayParam } from '@/lib/landing-filter-params';
import { PAGE_SIZE } from '@/lib/pagination';
import { searchSellerLandingEntityIds } from '@/lib/server/seller-landing-entity-search';
import { parseRowsLimit, parseRowsOffset, SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';

type CohortType = 'Geo-based' | 'Activity-based' | 'Brand affinity';

function buildPeriodFallbackFilter(
  primaryColumn: string,
  fallbackColumn: string,
  startIso: string,
  endExclusiveIso: string,
) {
  return `and(${primaryColumn}.gte.${startIso},${primaryColumn}.lt.${endExclusiveIso}),and(${primaryColumn}.is.null,${fallbackColumn}.gte.${startIso},${fallbackColumn}.lt.${endExclusiveIso})`;
}

function deriveCohortType(rules: unknown): CohortType {
  const json = rules && typeof rules === 'object' ? (rules as Record<string, unknown>) : null;
  const filters = Array.isArray(json?.filters) ? (json?.filters as Array<Record<string, unknown>>) : [];
  const fields = filters.map((f) => String(f.field ?? '').toLowerCase());
  if (fields.some((f) => f.includes('geography') || f.includes('city'))) return 'Geo-based';
  if (fields.some((f) => f.includes('last_order') || f.includes('gmv'))) return 'Activity-based';
  return 'Brand affinity';
}

function deriveFocusChips(rules: unknown, type: CohortType): string[] {
  const json = rules && typeof rules === 'object' ? (rules as Record<string, unknown>) : null;
  const filters = Array.isArray(json?.filters) ? (json?.filters as Array<Record<string, unknown>>) : [];

  const chips = filters
    .map((filter) => {
      const raw = filter.value;
      if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
      if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
      return [];
    })
    .flat()
    .slice(0, 3);

  if (chips.length > 0) return chips;
  if (type === 'Geo-based') return ['City cluster'];
  if (type === 'Activity-based') return ['Order history'];
  return ['Brand mix'];
}

export async function getCohortsLandingPayload(
  tenantId: string,
  periodInput?: string | null,
  filters: { search?: string; brands?: string[]; limit?: number; offset?: number; includeSummary?: boolean } = {},
) {
  const db = supabaseAdmin as any;
  const period = getSellerLandingPeriodMeta('last90');
  const limit = filters.limit ?? PAGE_SIZE.SELLER;
  const offset = filters.offset ?? 0;
  const search = filters.search?.trim() ?? '';
  const brandFilter = filters.brands ?? [];
  const includeSummary = filters.includeSummary ?? true;

  const landingSearch = await searchSellerLandingEntityIds({
    tenantId,
    entity: 'cohorts',
    query: search,
    brandIds: brandFilter,
    limit,
    offset,
  });

  const pageIds = landingSearch.ids;
  const cohortsQuery = pageIds.length > 0
    ? db
        .schema('app')
        .from('cohorts')
        .select('id, name, description, rules, is_static, cached_member_count, created_at, allowed_tenant_brand_ids')
        .eq('tenant_id', tenantId)
        .in('id', pageIds)
        .is('deleted_at', null)
        .limit(limit)
    : Promise.resolve({ data: [] as any[], error: null });
  const { data: cohorts, error: cohortsError } = await cohortsQuery;

  if (cohortsError) throw cohortsError;

  const { data: aggregatePayload, error: aggregateError } = await db.schema('app').rpc(
    'get_seller_cohort_landing_aggregates',
    {
      p_tenant_id: tenantId,
      p_page_ids: pageIds,
      p_current_start: period.current_start,
      p_current_end_exclusive: period.current_end_exclusive,
      p_previous_start: period.previous_start,
      p_previous_end_exclusive: period.previous_end_exclusive,
      p_views_by_cohort: {},
      p_include_summary: includeSummary,
    },
  );
  if (aggregateError) throw aggregateError;

  const aggregate = (aggregatePayload ?? {}) as any;
  const summary = includeSummary ? aggregate.summary : null;
  const calloutMetrics = summary?.callout_metrics ?? {};
  const allMetrics = [
    ...(aggregate.row_metrics ?? []),
    ...(calloutMetrics.low_conversion ?? []),
    ...(calloutMetrics.top_performers ?? []),
    ...(calloutMetrics.top_risers ?? []),
  ];
  const metricsById = new Map<string, any>(allMetrics.map((row: any) => [row.id, row]));
  const calloutIds = includeSummary
    ? [...new Set(allMetrics.map((row: any) => row.id).filter((id: string) => !pageIds.includes(id)))]
    : [];
  const calloutCohortsRes = calloutIds.length > 0
    ? await db
        .schema('app')
        .from('cohorts')
        .select('id, name, description, rules, is_static, cached_member_count, created_at, allowed_tenant_brand_ids')
        .eq('tenant_id', tenantId)
        .in('id', calloutIds)
        .is('deleted_at', null)
        .limit(6)
    : { data: [] as any[], error: null };
  if (calloutCohortsRes.error) throw calloutCohortsRes.error;

  const cohortBaseById = new Map<string, any>(
    [...(cohorts ?? []), ...(calloutCohortsRes.data ?? [])].map((row: any) => [row.id, row]),
  );
  const toLandingRow = (cohort: any, metric: any) => {
    const type = deriveCohortType(cohort.rules);
    const gmvMtd = Number(metric?.gmv_mtd ?? 0);
    const orders = Number(metric?.orders_mtd ?? 0);
    return {
      id: cohort.id,
      name: cohort.name,
      description: cohort.description ?? null,
      is_static: Boolean(cohort.is_static),
      type,
      focus_chips: deriveFocusChips(cohort.rules, type),
      allowed_brands_count: Array.isArray(cohort.allowed_tenant_brand_ids) ? cohort.allowed_tenant_brand_ids.length : null,
      allowed_brands_label: Array.isArray(cohort.allowed_tenant_brand_ids) ? `${cohort.allowed_tenant_brand_ids.length} brands` : 'All Brands',
      allowed_tenant_brand_ids: Array.isArray(cohort.allowed_tenant_brand_ids) ? cohort.allowed_tenant_brand_ids : null,
      gmv_mtd: gmvMtd,
      growth_pct: Number(metric?.growth_pct ?? 0),
      active_members: Number(metric?.active_members ?? 0),
      total_members: Number(metric?.total_members ?? cohort.cached_member_count ?? 0),
      conversion_pct: Number(metric?.conversion_pct ?? 0),
      live_catalogs_count: Number(metric?.live_catalogs_count ?? 0),
      status_label: cohort.is_static ? 'Static' : 'Dynamic',
      status_tone: cohort.is_static ? 'neutral' : 'success',
      aov: orders > 0 ? gmvMtd / orders : 0,
      orders_mtd: orders,
    };
  };
  const cohortRows = pageIds
    .map((id) => {
      const cohort = cohortBaseById.get(id);
      return cohort ? toLandingRow(cohort, metricsById.get(id)) : null;
    })
    .filter(Boolean);
  const buildCallouts = (key: string) => (calloutMetrics[key] ?? [])
    .map((metric: any) => {
      const cohort = cohortBaseById.get(metric.id);
      return cohort ? toLandingRow(cohort, metric) : null;
    })
    .filter(Boolean);

  const brandsRes = includeSummary
    ? await db
        .schema('app')
        .from('tenant_brands')
        .select('id, display_name_override, master_brand_id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [] as any[], error: null };
  if (brandsRes.error) throw brandsRes.error;
  const brands = brandsRes.data ?? [];
  const brandMasterIds = [...new Set(brands.map((brand: { master_brand_id: string | null }) => brand.master_brand_id).filter(Boolean) as string[])];
  const masterBrandNameById = new Map<string, string>();
  if (brandMasterIds.length > 0) {
    const { data: masterBrands } = await db
      .schema('catalog')
      .from('brands')
      .select('id, name, deleted_at')
      .in('id', brandMasterIds)
      .is('deleted_at', null)
      .limit(100);
    for (const row of masterBrands ?? []) {
      masterBrandNameById.set(row.id, row.name);
    }
  }

  return {
    ...(includeSummary ? {
      brands: brands.map((brand: { id: string; display_name_override: string | null; master_brand_id: string | null }) => ({
        id: brand.id,
        name: brand.display_name_override ?? (brand.master_brand_id ? masterBrandNameById.get(brand.master_brand_id) ?? 'Unknown brand' : 'Unknown brand'),
      })),
      kpis: summary?.kpis,
      todays_read: {
        low_conversion: buildCallouts('low_conversion'),
        top_performers: buildCallouts('top_performers'),
        top_risers: buildCallouts('top_risers'),
      },
    } : {}),
    cohorts: cohortRows,
    total: landingSearch.total,
    limit,
    offset,
    nextOffset: landingSearch.ids.length > 0 && offset + landingSearch.ids.length < landingSearch.total
      ? offset + landingSearch.ids.length
      : null,
    period,
  };
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('cohorts_api'));
    if (!init?.status || (init.status >= 200 && init.status < 300)) {
      response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    }
    return response;
  };
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }

  if (claims.role !== 'seller_admin') {
    return timedJson({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) {
    return timedJson({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return timedJson({ error: 'Server configuration error' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
  const brandFilter = readArrayParam(request.nextUrl.searchParams, 'brands');
  const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
  const offset = parseRowsOffset(request.nextUrl.searchParams.get('offset'));
  const landingSearch = await searchSellerLandingEntityIds({
    tenantId: claims.tenant_id,
    entity: 'cohorts',
    query: search,
    brandIds: brandFilter,
    limit,
    offset,
  });
  const { data: rows, error } = landingSearch.ids.length > 0
    ? await db
        .schema('app')
        .from('cohorts')
        .select('*')
        .eq('tenant_id', claims.tenant_id)
        .in('id', landingSearch.ids)
        .is('deleted_at', null)
        .limit(limit)
    : { data: [], error: null };

  if (error) {
    console.error('[GET /api/cohorts] DB error:', error.code, error.message);
    return timedJson({ error: 'Failed to fetch cohorts' }, { status: 500 });
  }

  const rowById = new Map((rows ?? []).map((row: { id: string }) => [row.id, row]));
  const orderedRows = landingSearch.ids.flatMap((id) => {
    const row = rowById.get(id);
    return row ? [row] : [];
  });

  return timedJson({
    cohorts: orderedRows,
    total: landingSearch.total,
    limit,
    offset,
    nextOffset: offset + orderedRows.length < landingSearch.total ? offset + orderedRows.length : null,
  });
}

export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const simpleParsed = CustomerGroupFormPayloadSchema.safeParse(body);
  const composerParsed = simpleParsed.success ? null : CohortCreateSchema.safeParse(body);
  if (!simpleParsed.success && !composerParsed?.success) {
    return NextResponse.json({ error: composerParsed?.error.errors[0]?.message ?? simpleParsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 422 });
  }

  const isSimpleForm = simpleParsed.success;
  const membershipMode = isSimpleForm ? simpleParsed.data.membership_mode : 'manual';
  const data: any = isSimpleForm
    ? {
        name: simpleParsed.data.name,
        description: simpleParsed.data.description,
        is_static: membershipMode === 'manual',
        rules: membershipMode === 'automatic' ? simpleParsed.data.rules : null,
        allowed_tenant_brand_ids: simpleParsed.data.allowed_tenant_brand_ids,
      }
    : composerParsed!.data;
  const allowedTenantBrandIds =
    data.allowed_tenant_brand_ids && data.allowed_tenant_brand_ids.length > 0
      ? data.allowed_tenant_brand_ids
      : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: nameMatch } = await db
    .schema('app')
    .from('cohorts')
    .select('id')
    .eq('tenant_id', claims.tenant_id)
    .eq('name', data.name)
    .is('deleted_at', null)
    .maybeSingle();

  if (nameMatch) {
    return NextResponse.json({ error: 'A cohort with this name already exists.' }, { status: 409 });
  }

  const { data: cohort, error: insertError } = await db
    .schema('app')
    .from('cohorts')
    .insert({
      tenant_id: claims.tenant_id,
      name: data.name,
      description: data.description ?? null,
      is_static: data.is_static,
      membership_mode: membershipMode,
      rules: data.rules ?? null,
      allowed_tenant_brand_ids: allowedTenantBrandIds,
      created_by: claims.sub,
      updated_by: claims.sub,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[POST /api/cohorts] DB error:', insertError.code, insertError.message);
    return NextResponse.json({ error: 'Failed to create cohort' }, { status: 500 });
  }

  let cachedMemberCount = 0;

  if (!isSimpleForm) {
    try {
      const memberIds = await resolveAllBuyerIdsForRules(db, claims.tenant_id, data.rules, data.is_static);
      cachedMemberCount = memberIds.length;

      if (memberIds.length > 0) {
        // SCD2: cohort_members only enforces uniqueness on the active row via a partial
        // index, which upsert-on-conflict can't target -- insert only for pairs with no
        // existing active row (a brand-new cohort has none, so this is effectively all rows,
        // but stays correct if this path is ever reused for an existing cohort).
        const rows = memberIds.map((buyerId) => ({ cohort_id: cohort.id, buyer_id: buyerId }));
        const { error: membersError } = await db.schema('app').from('cohort_members').insert(rows);

        if (membersError) {
          console.error('[POST /api/cohorts] member sync error:', membersError.message);
          return NextResponse.json({ error: 'Cohort created but failed to save members' }, { status: 500 });
        }
      }

      await db
        .schema('app')
        .from('cohorts')
        .update({ cached_member_count: cachedMemberCount })
        .eq('id', cohort.id)
        .eq('tenant_id', claims.tenant_id);
    } catch (error: any) {
      console.error('[POST /api/cohorts] composer sync error:', error?.message);
      return NextResponse.json({ error: 'Cohort created but failed to build membership' }, { status: 500 });
    }
  } else if (membershipMode === 'automatic') {
    // Recompute now (requirement 4: automatic membership evaluated on save), not left frozen
    // until the next scheduled refresh.
    const { error: refreshError } = await db.schema('app').rpc('refresh_cohort_by_id', { p_cohort_id: cohort.id });
    if (refreshError) {
      console.error('[POST /api/cohorts] refresh error:', refreshError.message);
    } else {
      const { count } = await db
        .schema('app')
        .from('cohort_members_active')
        .select('*', { count: 'exact', head: true })
        .eq('cohort_id', cohort.id);
      cachedMemberCount = count ?? 0;
    }
  }

  return NextResponse.json({ cohort: { ...cohort, cached_member_count: cachedMemberCount } }, { status: 201 });
}
