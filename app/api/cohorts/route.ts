import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { createTimer } from '@/lib/server-timing';
import { CohortCreateSchema } from '@/lib/zod';

type CohortType = 'Geo-based' | 'Tier-based' | 'Brand affinity';

function getIstBoundaries(now = new Date()) {
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const year = istNow.getFullYear();
  const month = istNow.getMonth();
  const day = istNow.getDate();

  const mtdStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  const prevMonthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const prevMonthSameDayExclusive = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));

  return {
    mtdStartIso: mtdStart.toISOString(),
    nextMonthStartIso: nextMonthStart.toISOString(),
    prevMonthStartIso: prevMonthStart.toISOString(),
    prevMonthMtdEndIso: prevMonthSameDayExclusive.toISOString(),
  };
}

function deriveCohortType(rules: unknown): CohortType {
  const json = rules && typeof rules === 'object' ? (rules as Record<string, unknown>) : null;
  const filters = Array.isArray(json?.filters) ? (json?.filters as Array<Record<string, unknown>>) : [];
  const fields = filters.map((f) => String(f.field ?? '').toLowerCase());
  if (fields.some((f) => f.includes('geography') || f.includes('city') || f.includes('state'))) return 'Geo-based';
  if (fields.some((f) => f.includes('tier'))) return 'Tier-based';
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
  if (type === 'Geo-based') return ['State cluster'];
  if (type === 'Tier-based') return ['Tier segment'];
  return ['Brand mix'];
}

async function getCatalogViewsByCohort(
  tenantId: string,
  period: { fromIso: string; toIso: string },
): Promise<Map<string, number>> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

  if (!apiKey || !projectId) return new Map();

  try {
    const response = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: {
          kind: 'HogQLQuery',
          query: `
            SELECT
              properties.cohort_id AS cohort_id,
              count(DISTINCT person_id) AS unique_views
            FROM events
            WHERE event = 'catalog_viewed'
              AND properties.tenant_id = {tenant_id:String}
              AND timestamp >= toDateTime({from_ts:String})
              AND timestamp < toDateTime({to_ts:String})
              AND properties.cohort_id IS NOT NULL
            GROUP BY cohort_id
          `,
          placeholders: {
            tenant_id: tenantId,
            from_ts: period.fromIso,
            to_ts: period.toIso,
          },
        },
      }),
    });

    if (!response.ok) return new Map();
    const payload = (await response.json()) as { results?: Array<[string, number] | { cohort_id: string; unique_views: number }> };
    const map = new Map<string, number>();
    for (const row of payload.results ?? []) {
      if (Array.isArray(row)) {
        map.set(String(row[0]), Number(row[1] ?? 0));
        continue;
      }
      map.set(String(row.cohort_id), Number(row.unique_views ?? 0));
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function getCohortsLandingPayload(tenantId: string) {
  const db = supabaseAdmin as any;
  const { mtdStartIso, nextMonthStartIso, prevMonthStartIso, prevMonthMtdEndIso } = getIstBoundaries();

  const { data: cohorts, error: cohortsError } = await db
    .schema('app')
    .from('cohorts')
    .select('id, name, description, rules, is_static, cached_member_count, created_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (cohortsError) throw cohortsError;

  const cohortIds = (cohorts ?? []).map((cohort: { id: string }) => cohort.id);

  const [buyersRes, membersRes, monthOrdersRes, prevOrdersRes, catalogsRes] = await Promise.all([
    db
      .schema('app')
      .from('buyers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null),
    cohortIds.length
      ? db
          .schema('app')
          .from('cohort_members')
          .select('cohort_id, buyer_id')
          .in('cohort_id', cohortIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, total_amount, status, placed_at')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('placed_at', mtdStartIso)
      .lt('placed_at', nextMonthStartIso),
    db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, total_amount, status, placed_at')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('placed_at', prevMonthStartIso)
      .lt('placed_at', prevMonthMtdEndIso),
    db
      .schema('app')
      .from('published_catalogs')
      .select('id, scope_type, scope_value, status')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
  ]);

  if (buyersRes.error) throw buyersRes.error;
  if (membersRes.error) throw membersRes.error;
  if (monthOrdersRes.error) throw monthOrdersRes.error;
  if (prevOrdersRes.error) throw prevOrdersRes.error;
  if (catalogsRes.error) throw catalogsRes.error;

  const buyers = buyersRes.data ?? [];
  const members = membersRes.data ?? [];
  const monthOrders = monthOrdersRes.data ?? [];
  const prevOrders = prevOrdersRes.data ?? [];
  const catalogs = catalogsRes.data ?? [];

  const memberBuyerSet = new Set<string>();
  const membersByCohort = new Map<string, Set<string>>();
  for (const row of members) {
    memberBuyerSet.add(row.buyer_id);
    const existing = membersByCohort.get(row.cohort_id) ?? new Set<string>();
    existing.add(row.buyer_id);
    membersByCohort.set(row.cohort_id, existing);
  }

  const cohortByBuyer = new Map<string, string>();
  for (const cohort of cohorts ?? []) {
    const ids = membersByCohort.get(cohort.id);
    if (!ids) continue;
    for (const buyerId of ids) {
      if (!cohortByBuyer.has(buyerId)) cohortByBuyer.set(buyerId, cohort.id);
    }
  }

  const viewsByCohort = await getCatalogViewsByCohort(tenantId, {
    fromIso: mtdStartIso,
    toIso: nextMonthStartIso,
  });

  const gmvMtdByCohort = new Map<string, number>();
  const gmvPrevByCohort = new Map<string, number>();
  const orderCountByCohort = new Map<string, number>();
  const activeBuyersByCohort = new Map<string, Set<string>>();

  for (const order of monthOrders) {
    const cohortId = cohortByBuyer.get(order.buyer_id);
    if (!cohortId) continue;
    gmvMtdByCohort.set(cohortId, (gmvMtdByCohort.get(cohortId) ?? 0) + Number(order.total_amount ?? 0));
    orderCountByCohort.set(cohortId, (orderCountByCohort.get(cohortId) ?? 0) + 1);
    const activeSet = activeBuyersByCohort.get(cohortId) ?? new Set<string>();
    activeSet.add(order.buyer_id);
    activeBuyersByCohort.set(cohortId, activeSet);
  }

  for (const order of prevOrders) {
    const cohortId = cohortByBuyer.get(order.buyer_id);
    if (!cohortId) continue;
    gmvPrevByCohort.set(cohortId, (gmvPrevByCohort.get(cohortId) ?? 0) + Number(order.total_amount ?? 0));
  }

  const liveCatalogsByCohort = new Map<string, number>();
  for (const catalog of catalogs) {
    if (catalog.scope_type !== 'cohort') continue;
    const cohortId = catalog.scope_value?.cohort_id;
    if (!cohortId) continue;
    if (catalog.status !== 'live') continue;
    liveCatalogsByCohort.set(cohortId, (liveCatalogsByCohort.get(cohortId) ?? 0) + 1);
  }

  const cohortRows = (cohorts ?? []).map((cohort: any) => {
    const type = deriveCohortType(cohort.rules);
    const memberSet = membersByCohort.get(cohort.id) ?? new Set<string>();
    const totalMembers = cohort.cached_member_count ?? memberSet.size;
    const activeMembers = (activeBuyersByCohort.get(cohort.id) ?? new Set<string>()).size;
    const gmvMtd = gmvMtdByCohort.get(cohort.id) ?? 0;
    const gmvPrev = gmvPrevByCohort.get(cohort.id) ?? 0;
    const growthPct = gmvPrev > 0 ? Math.round(((gmvMtd - gmvPrev) / gmvPrev) * 100) : 0;
    const orders = orderCountByCohort.get(cohort.id) ?? 0;
    const views = viewsByCohort.get(cohort.id) ?? 0;
    const conversionPct = views > 0 ? Number(((orders / views) * 100).toFixed(1)) : 0;

    return {
      id: cohort.id,
      name: cohort.name,
      description: cohort.description ?? null,
      type,
      focus_chips: deriveFocusChips(cohort.rules, type),
      gmv_mtd: gmvMtd,
      growth_pct: growthPct,
      active_members: activeMembers,
      total_members: totalMembers,
      conversion_pct: conversionPct,
      live_catalogs_count: liveCatalogsByCohort.get(cohort.id) ?? 0,
      status_label: cohort.is_static ? 'Static' : 'Dynamic',
      status_tone: cohort.is_static ? 'neutral' : 'success',
      aov: orders > 0 ? gmvMtd / orders : 0,
      orders_mtd: orders,
    };
  });

  const totalBuyers = buyers.length;
  const uncategorisedBuyers = buyers.filter((buyer: { id: string }) => !memberBuyerSet.has(buyer.id)).length;
  const coveredMembers = totalBuyers - uncategorisedBuyers;
  const combinedGmvMtd = cohortRows.reduce((sum: number, row: any) => sum + row.gmv_mtd, 0);
  const combinedGmvPrev = cohortRows.reduce((sum: number, row: any) => {
    const prev = gmvPrevByCohort.get(row.id) ?? 0;
    return sum + prev;
  }, 0);
  const growthPct = combinedGmvPrev > 0 ? Math.round(((combinedGmvMtd - combinedGmvPrev) / combinedGmvPrev) * 100) : 0;
  const avgConversionPct =
    cohortRows.length > 0 ? Number((cohortRows.reduce((sum: number, row: any) => sum + row.conversion_pct, 0) / cohortRows.length).toFixed(1)) : 0;

  const lowConversion = [...cohortRows].sort((a, b) => a.conversion_pct - b.conversion_pct).slice(0, 2);
  const topPerformers = [...cohortRows].sort((a, b) => b.gmv_mtd - a.gmv_mtd).slice(0, 2);
  const topRisers = [...cohortRows].sort((a, b) => b.growth_pct - a.growth_pct).slice(0, 2);

  return {
    kpis: {
      total_cohorts: cohortRows.length,
      covered_members: coveredMembers,
      total_buyers: totalBuyers,
      combined_gmv_mtd: combinedGmvMtd,
      growth_pct: growthPct,
      avg_conversion_pct: avgConversionPct,
      uncategorised_buyers: uncategorisedBuyers,
    },
    todays_read: {
      low_conversion: lowConversion,
      top_performers: topPerformers,
      top_risers: topRisers,
    },
    cohorts: cohortRows,
    period: {
      timezone: 'Asia/Kolkata',
      current_month_start: mtdStartIso,
      current_month_end_exclusive: nextMonthStartIso,
      previous_mtd_start: prevMonthStartIso,
      previous_mtd_end_exclusive: prevMonthMtdEndIso,
    },
  };
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('cohorts_api'));
    return response;
  };
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
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
  const { data: rows, error } = await db
    .schema('app')
    .from('cohorts')
    .select('*')
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET /api/cohorts] DB error:', error.code, error.message);
    return timedJson({ error: 'Failed to fetch cohorts' }, { status: 500 });
  }

  return timedJson({ cohorts: rows ?? [] });
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

  const parsed = CohortCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 422 });
  }

  const data = parsed.data;

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
      rules: data.rules ?? null,
      created_by: null,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[POST /api/cohorts] DB error:', insertError.code, insertError.message);
    return NextResponse.json({ error: 'Failed to create cohort' }, { status: 500 });
  }

  return NextResponse.json({ cohort }, { status: 201 });
}
