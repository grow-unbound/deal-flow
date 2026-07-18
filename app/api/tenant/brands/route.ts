import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { createTenantBrand } from '@/lib/server/tenant-brand-create';
import { getPostHogClient } from '@/lib/posthog-server';
import { readArrayParam } from '@/lib/landing-filter-params';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseRowsLimit, parseRowsOffset, SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';

type TenantBrandLandingRow = {
  id: string;
  tenant_id: string;
  master_brand_id: string | null;
  display_name_override: string | null;
  slug: string | null;
  description: string | null;
  logo_url: string | null;
  margin_pct: number | null;
  exclusivity: boolean | null;
  is_active: boolean;
  external_ref: string | null;
  principal_name: string | null;
  principal_email: string | null;
  principal_phone: string | null;
  principal_location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_cohort_id: string | null;
  created_at: string;
  updated_at: string;
  master_brand: { id: string; name: string; slug: string; logo_url: string | null; description: string | null } | null;
  gmv_mtd: number;
  gmv_prev_mtd: number;
  growth_pct: number;
  portfolio_share_pct: number;
  sku_count: number;
  active_buyers_mtd: number;
  total_buyers: number;
  catalog_days_ago: number | null;
  categories: string[];
  catalog_name: string | null;
  alerts: string[];
};

type BrandLandingSummary = {
  kpis: Record<string, number | null>;
  todays_read: {
    needs_attention: Array<Record<string, unknown>>;
    top_performers: Array<Record<string, unknown>>;
    top_risers: Array<Record<string, unknown>>;
  };
  categories: string[];
  cohorts: Array<{ id: string; name: string }>;
};

export async function GET(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const flagEnabled = await getFlag('df_brand_product_master', claims.tenant_id);
    if (!flagEnabled) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;
    const isAssistant = claims.role === 'seller_assistant';
    const assistantLocationIds = isAssistant ? (claims.location_ids ?? []).filter(Boolean) : [];
    const period = getSellerLandingPeriodMeta('last90');
    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const categoryFilter = readArrayParam(req.nextUrl.searchParams, 'categories');
    const cohortFilter = readArrayParam(req.nextUrl.searchParams, 'cohorts');
    const limit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const offset = parseRowsOffset(req.nextUrl.searchParams.get('offset'));
    const includeSummary = req.nextUrl.searchParams.get('include_summary') !== 'false';
    const locationScope = isAssistant ? assistantLocationIds : null;
    const periodArgs = {
      p_current_start: period.current_start.split('T')[0],
      p_current_end: period.current_end_exclusive.split('T')[0],
      p_previous_start: period.previous_start.split('T')[0],
      p_previous_end: period.previous_end_exclusive.split('T')[0],
    };

    const { data: pageData, error: pageError } = await db.schema('app').rpc('search_seller_brand_landing_page', {
      p_tenant_id: tenantId,
      p_query: search || null,
      p_category_names: categoryFilter.length > 0 ? categoryFilter.map((value) => value.toLowerCase()) : null,
      p_cohort_ids: cohortFilter.length > 0 ? cohortFilter : null,
      p_location_ids: locationScope,
      p_current_start: period.current_start,
      p_current_end: period.current_end_exclusive,
      p_previous_start: period.previous_start,
      p_previous_end: period.previous_end_exclusive,
      p_limit: limit,
      p_offset: offset,
    });
    if (pageError) {
      console.error('[GET /api/tenant/brands] row query error:', pageError.code, pageError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const pageResult = (pageData ?? []) as Array<{ id: string | null; total_count: number | string }>;
    const pageBrandIds = pageResult.flatMap((row) => row.id ? [row.id] : []);
    const total = Number(pageResult[0]?.total_count ?? 0);

    const [rowsResult, summaryResult, productBrandingResult] = await Promise.all([
      pageBrandIds.length > 0
        ? db.schema('app').rpc('get_seller_brand_landing_rows', {
            p_tenant_id: tenantId,
            p_brand_ids: pageBrandIds,
            p_location_ids: locationScope,
            ...periodArgs,
          })
        : Promise.resolve({ data: [], error: null }),
      includeSummary
        ? db.schema('app').rpc('get_seller_brand_landing_summary', {
            p_tenant_id: tenantId,
            p_location_ids: locationScope,
            ...periodArgs,
          })
        : Promise.resolve({ data: null, error: null }),
      // Subtitle needs "{branded} of {active} active products branded" — the landing
      // summary RPC has no product-level fields, so pull the two counts directly off
      // tenant_products (same plain-select pattern the categories landing route uses)
      // instead of adding a new RPC.
      includeSummary
        ? Promise.all([
            db.schema('app').from('tenant_products').select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId).is('deleted_at', null).eq('is_active', true),
            db.schema('app').from('tenant_products').select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId).is('deleted_at', null).eq('is_active', true).not('tenant_brand_id', 'is', null),
          ])
        : Promise.resolve(null),
    ]);

    if (rowsResult.error || summaryResult.error) {
      const error = rowsResult.error ?? summaryResult.error;
      console.error('[GET /api/tenant/brands] read model error:', error?.code, error?.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const rowsById = new Map(
      ((rowsResult.data ?? []) as Array<{ id: string; row_data: TenantBrandLandingRow }>)
        .map((row) => [row.id, row.row_data]),
    );
    const brands = pageBrandIds
      .map((id) => rowsById.get(id))
      .filter((brand): brand is TenantBrandLandingRow => Boolean(brand));
    const summary = (summaryResult.data ?? null) as BrandLandingSummary | null;
    const activeProductCount = productBrandingResult ? Number(productBrandingResult[0]?.count ?? 0) : 0;
    const brandedProductCount = productBrandingResult ? Number(productBrandingResult[1]?.count ?? 0) : 0;
    const nextOffset = pageBrandIds.length > 0 && offset + pageBrandIds.length < total
      ? offset + pageBrandIds.length
      : null;

    return NextResponse.json({
      period,
      ...(includeSummary && summary ? summary : {}),
      ...(includeSummary ? { active_product_count: activeProductCount, branded_product_count: brandedProductCount } : {}),
      brands,
      total,
      limit,
      offset,
      nextOffset,
    }, { headers: { 'Cache-Control': SELLER_GET_CACHE_CONTROL } });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const body = await req.json();
    const created = await createTenantBrand(db, claims, body);

    try {
      const ph = getPostHogClient();
      ph.capture({
        distinctId: claims.sub ?? claims.tenant_id,
        event: 'brand_created',
        properties: {
          tenant_id: claims.tenant_id,
          brand_id: (created as { id?: string })?.id,
        },
      });
      await ph.flush();
    } catch {
      // Analytics is non-blocking for brand creation.
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && 'error' in err) {
      const typedErr = err as { status: number; error: string; details?: unknown };
      return NextResponse.json(
        typedErr.details ? { error: typedErr.error, details: typedErr.details } : { error: typedErr.error },
        { status: typedErr.status },
      );
    }
    console.error('[POST /api/tenant/brands] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
