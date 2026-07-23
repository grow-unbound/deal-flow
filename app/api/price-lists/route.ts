import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { createTimer } from '@/lib/server-timing';
import { getAuthUserEmailMap } from '@/lib/server/auth-user-directory';
import { readArrayParam } from '@/lib/landing-filter-params';
import { PriceListComposerPayloadSchema, PriceListFormPayloadSchema, type PriceListFilterState } from '@/lib/zod';
import { PAGE_SIZE } from '@/lib/pagination';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit, parseRowsOffset } from '@/lib/server/bounded-get';
import { searchSellerLandingEntityIds } from '@/lib/server/seller-landing-entity-search';

type LandingStatus = 'active' | 'draft' | 'expired';
type LandingStatusTone = 'success' | 'warning' | 'neutral';

type PriceListRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  priority: number;
  is_active: boolean;
  pricing_strategy: 'edit_each' | 'margin_from_mrp' | 'flat_off_base';
  strategy_value: number | null;
  filters: PriceListFilterState | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

type PriceListLandingMetric = {
  id: string;
  product_count: number | string;
  avg_discount_pct: number | string | null;
  avg_margin_pct: number | string | null;
  cohorts_count: number | string;
  cohort_names: string[] | null;
};

type PriceListLandingSummary = {
  kpis?: Record<string, number | string>;
  counts?: Record<string, number | string>;
  todays_read?: {
    expiring_soon?: Array<{
      id: string;
      name: string;
      valid_until: string | null;
      cohorts_count: number | string;
      status: LandingStatus;
    }>;
    most_coverage?: Array<{
      id: string;
      name: string;
      product_count: number | string;
      valid_until: string | null;
    }>;
    uncovered_cohorts?: Array<{
      id: string;
      name: string;
      member_count: number | string;
    }>;
  };
};

type PriceListLandingAggregate = {
  row_metrics?: PriceListLandingMetric[];
  summary?: PriceListLandingSummary | null;
};

function toInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'No end date';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function deriveStatus(row: PriceListRow, nowTs: number): LandingStatus {
  const validFromTs = row.valid_from ? new Date(row.valid_from).getTime() : Number.NEGATIVE_INFINITY;
  const validToTs = row.valid_to ? new Date(row.valid_to).getTime() : Number.POSITIVE_INFINITY;

  if (validToTs < nowTs) return 'expired';
  if (!row.is_active) return 'draft';
  if (validFromTs > nowTs) return 'draft';
  return 'active';
}

function statusTone(status: LandingStatus): LandingStatusTone {
  if (status === 'active') return 'success';
  if (status === 'draft') return 'warning';
  return 'neutral';
}

function isExpiringSoon(row: PriceListRow, nowTs: number, withinTs: number): boolean {
  if (!row.is_active || !row.valid_to) return false;
  const startTs = row.valid_from ? new Date(row.valid_from).getTime() : Number.NEGATIVE_INFINITY;
  const endTs = new Date(row.valid_to).getTime();
  return startTs <= nowTs && endTs >= nowTs && endTs <= withinTs;
}

async function ensureTenantProducts(
  db: any,
  tenantId: string,
  tenantProductIds: string[],
) {
  if (tenantProductIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await db
    .schema('app')
    .from('tenant_products')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('id', tenantProductIds)
    .is('deleted_at', null);

  if (error) {
    throw new Error('Failed to validate selected products');
  }

  return new Set<string>(((data ?? []) as Array<{ id: string }>).map((row) => row.id));
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    return jsonWithServerTiming(body, timer, 'price_lists_api', init, APP_GET_CACHE_CONTROL);
  };
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }

  if (claims.role !== 'seller_admin') {
    return timedJson({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_pricing_engine', claims.tenant_id);
  if (!flagEnabled) {
    return timedJson({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return timedJson({ error: 'Server configuration error' }, { status: 500 });
  }

  const now = new Date();
  const nowTs = now.getTime();
  const withinSevenDaysTs = nowTs + 7 * 24 * 60 * 60 * 1000;
  const search = request.nextUrl.searchParams.get('search')?.trim() ?? '';
  const statusFilter = readArrayParam(request.nextUrl.searchParams, 'status');
  const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
  const offset = parseRowsOffset(request.nextUrl.searchParams.get('offset'));
  const includeSummary = request.nextUrl.searchParams.get('include_summary') !== 'false';

  const landingSearch = await searchSellerLandingEntityIds({
    tenantId: claims.tenant_id,
    entity: 'price_lists',
    query: search,
    statuses: statusFilter.map((value) => value.toLowerCase()).filter((value) => value !== 'all'),
    limit,
    offset,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const pageIds = landingSearch.ids;
  const priceListsQuery = pageIds.length > 0
    ? db
        .schema('app')
        .from('price_lists')
        .select('id, tenant_id, name, description, currency, valid_from, valid_to, priority, is_active, pricing_strategy, strategy_value, filters, created_at, updated_at, created_by')
        .eq('tenant_id', claims.tenant_id)
        .in('id', pageIds)
        .is('deleted_at', null)
        .limit(limit)
    : { data: [] as PriceListRow[], error: null };

  const [priceListsRes, aggregateRes] = await Promise.all([
    priceListsQuery,
    db.schema('app').rpc(
      'get_seller_price_list_landing_aggregates',
      {
        p_tenant_id: claims.tenant_id,
        p_page_ids: pageIds,
        p_include_summary: includeSummary,
        p_now: now.toISOString(),
      },
    ),
  ]);
  const { data: aggregateData, error: aggregateError } = aggregateRes;

  if (priceListsRes.error || aggregateError) {
    console.error('[GET /api/price-lists] query error:', priceListsRes.error || aggregateError);
    return timedJson({ error: 'Failed to fetch price lists' }, { status: 500 });
  }

  const priceLists = (priceListsRes.data ?? []) as PriceListRow[];
  const aggregate = (aggregateData ?? {}) as PriceListLandingAggregate;
  const summary = includeSummary ? aggregate.summary ?? null : null;
  const metricsById = new Map(
    (aggregate.row_metrics ?? []).map((metric) => [metric.id, metric]),
  );

  const createdByIds = Array.from(
    new Set(priceLists.map((pl) => pl.created_by).filter((id): id is string => Boolean(id))),
  );

  const createdByMap = await getAuthUserEmailMap(createdByIds);

  const rowModels = priceLists.map((pl) => {
    const status = deriveStatus(pl, nowTs);
    const metric = metricsById.get(pl.id);

    return {
      id: pl.id,
      name: pl.name,
      description: pl.description ?? null,
      priority: pl.priority,
      currency: pl.currency,
      valid_from: pl.valid_from,
      valid_to: pl.valid_to,
      updated_at: pl.updated_at,
      created_at: pl.created_at,
      status,
      status_tone: statusTone(status),
      cohorts_count: Number(metric?.cohorts_count ?? 0),
      cohort_names: metric?.cohort_names ?? [],
      product_count: Number(metric?.product_count ?? 0),
      avg_discount_pct: metric?.avg_discount_pct == null ? null : Number(metric.avg_discount_pct),
      avg_margin_pct: metric?.avg_margin_pct == null ? null : Number(metric.avg_margin_pct),
      created_by_label: pl.created_by ? createdByMap.get(pl.created_by) ?? 'Team member' : 'Team member',
      is_expiring_soon: isExpiringSoon(pl, nowTs, withinSevenDaysTs),
      pricing_strategy: pl.pricing_strategy,
      strategy_value: pl.strategy_value,
    };
  });

  const rowModelById = new Map(rowModels.map((row) => [row.id, row]));
  const filteredRows = landingSearch.ids
    .map((id) => rowModelById.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const summaryKpis = summary?.kpis ?? {};
  const summaryCounts = summary?.counts ?? {};
  const summaryRead = summary?.todays_read ?? {};

  return timedJson({
    ...(includeSummary ? {
      kpis: {
        active_lists: Number(summaryKpis.active_lists ?? 0),
        draft_lists: Number(summaryKpis.draft_lists ?? 0),
        expiring_soon: Number(summaryKpis.expiring_soon ?? 0),
        cohorts_covered: Number(summaryKpis.cohorts_covered ?? 0),
        cohorts_total: Number(summaryKpis.cohorts_total ?? 0),
        products_with_overrides: Number(summaryKpis.products_with_overrides ?? 0),
        products_with_custom_prices: Number(summaryKpis.products_with_custom_prices ?? summaryKpis.products_with_overrides ?? 0),
        customers_with_custom_prices: Number(summaryKpis.customers_with_custom_prices ?? 0),
        products_below_base_rate: Number(summaryKpis.products_below_base_rate ?? 0),
      },
      todays_read: {
        expiring_soon: (summaryRead.expiring_soon ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          initials: toInitials(row.name),
          valid_until: row.valid_until,
          valid_until_label: fmtDate(row.valid_until),
          cohorts_count: Number(row.cohorts_count ?? 0),
          status: row.status,
          status_tone: statusTone(row.status),
        })),
        most_coverage: (summaryRead.most_coverage ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          initials: toInitials(row.name),
          product_count: Number(row.product_count ?? 0),
          valid_until: row.valid_until,
          valid_until_label: fmtDate(row.valid_until),
        })),
        uncovered_cohorts: (summaryRead.uncovered_cohorts ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          initials: toInitials(row.name),
          member_count: Number(row.member_count ?? 0),
        })),
      },
      cohorts_total: Number(summaryKpis.cohorts_total ?? 0),
      counts: {
        active: Number(summaryCounts.active ?? 0),
        draft: Number(summaryCounts.draft ?? 0),
        expired: Number(summaryCounts.expired ?? 0),
      },
    } : {}),
    price_lists: filteredRows,
    total: landingSearch.total,
    limit,
    offset,
    nextOffset: landingSearch.ids.length > 0 && offset + landingSearch.ids.length < landingSearch.total
      ? offset + landingSearch.ids.length
      : null,
  });
}

export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_pricing_engine', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  const simpleParsed = PriceListFormPayloadSchema.safeParse(body);
  const composerParsed = simpleParsed.success ? null : PriceListComposerPayloadSchema.safeParse(body);
  if (!simpleParsed.success && !composerParsed?.success) {
    return NextResponse.json(
      { error: composerParsed?.error.errors[0]?.message ?? simpleParsed.error.errors[0]?.message ?? 'Validation failed' },
      { status: 422 },
    );
  }

  const isSimpleForm = simpleParsed.success;
  const data: any = isSimpleForm ? simpleParsed.data : composerParsed!.data;
  if (!isSimpleForm && data.save_mode === 'publish' && data.item_prices.length === 0) {
    return NextResponse.json({ error: 'Add at least one product before publishing.' }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  if (!isSimpleForm) {
    const tenantProductIds = data.item_prices.map((item: any) => item.tenant_product_id);

    let validProductIds: Set<string>;
    try {
      validProductIds = await ensureTenantProducts(db, claims.tenant_id, tenantProductIds);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to validate selected products' }, { status: 500 });
    }

    if (validProductIds.size !== tenantProductIds.length) {
      return NextResponse.json({ error: 'One or more selected products are invalid.' }, { status: 422 });
    }
  }

  const simpleMembershipMode = isSimpleForm ? data.membership_mode : 'manual';

  const { data: priceList, error: insertError } = await db
    .schema('app')
    .from('price_lists')
    .insert({
      tenant_id: claims.tenant_id,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      currency: isSimpleForm ? 'INR' : data.currency,
      valid_from: data.valid_from.toISOString(),
      valid_to: data.valid_to ? data.valid_to.toISOString() : null,
      priority: data.priority,
      is_active: isSimpleForm ? false : data.save_mode === 'publish',
      pricing_strategy: isSimpleForm ? 'edit_each' : data.pricing_strategy,
      strategy_value: isSimpleForm ? null : (data.pricing_strategy === 'edit_each' ? null : (data.strategy_value ?? null)),
      // Composer path: membership_mode inferred the same way the Phase 1 backfill did --
      // non-edit_each pricing with populated filters implies automatic product membership.
      membership_mode: isSimpleForm
        ? simpleMembershipMode
        : (data.pricing_strategy !== 'edit_each' && data.filters && Object.keys(data.filters).length > 0 ? 'automatic' : 'manual'),
      filters: isSimpleForm
        ? (simpleMembershipMode === 'automatic' ? data.rules : { brand_names: [], category_names: [], availability: 'show_all' })
        : data.filters,
      created_by: claims.sub,
      updated_by: claims.sub,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[POST /api/price-lists] DB error:', insertError.code, insertError.message, insertError.details);
    return NextResponse.json(
      { error: 'Failed to create price list', code: insertError.code, detail: insertError.message },
      { status: 500 },
    );
  }

  if (isSimpleForm && simpleMembershipMode === 'automatic') {
    // Recompute now (requirement 4), not left frozen until the next scheduled refresh.
    const { error: refreshError } = await db.schema('app').rpc('refresh_price_list_by_id', { p_price_list_id: priceList.id });
    if (refreshError) {
      console.error('[POST /api/price-lists] refresh error:', refreshError.message);
    }
  }

  if (!isSimpleForm && data.item_prices.length > 0) {
    const { error: itemsError } = await db
      .schema('app')
      .from('price_list_items')
      .insert(
        data.item_prices.map((item: any) => ({
          price_list_id: priceList.id,
          tenant_product_id: item.tenant_product_id,
          price: item.price,
          min_qty: item.min_qty,
          max_qty: item.max_qty ?? null,
          created_by: claims.sub,
          updated_by: claims.sub,
        })),
      );

    if (itemsError) {
      console.error('[POST /api/price-lists] item insert error:', itemsError.code, itemsError.message, itemsError.details);
      return NextResponse.json(
        { error: 'Price list was created but products could not be saved', code: itemsError.code, detail: itemsError.message },
        { status: 500 },
      );
    }
  }

  await db.schema('app').from('audit_log').insert({
    tenant_id: claims.tenant_id,
    actor_user_id: claims.sub,
      entity_type: 'price_list',
      entity_id: priceList.id,
      action: 'create',
      diff: {
      event: isSimpleForm ? 'price_list_created_simple' : data.save_mode === 'publish' ? 'price_list_published' : 'price_list_draft_saved',
      item_count: isSimpleForm ? 0 : data.item_prices.length,
      pricing_strategy: isSimpleForm ? 'edit_each' : data.pricing_strategy,
      },
      ts: new Date().toISOString(),
  });

  return NextResponse.json({ price_list: priceList }, { status: 201 });
}
