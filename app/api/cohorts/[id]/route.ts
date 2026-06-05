import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { CohortUpdateSchema } from '@/lib/zod';
import { getCohortComposerPayload, resolveBuyerIdsForRules } from '@/lib/server/cohort-composer';

type DbClient = NonNullable<typeof supabaseAdmin>;

type BuyerRow = {
  id: string;
  business_name: string;
  tier: 'A' | 'B' | 'C' | null;
  geography: { city?: string; state?: string } | null;
};

type OrderRow = {
  id: string;
  buyer_id: string;
  total_amount: number | null;
  status: string;
  placed_at: string | null;
  catalog_id: string | null;
};

type CatalogRow = {
  id: string;
  scope_type: string;
  scope_value: { cohort_id?: string } | null;
  status: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type CatalogItemRow = {
  catalog_id: string;
  tenant_product_id: string;
};

type TenantProductRow = {
  id: string;
  tenant_brand_id: string | null;
};

function getIstMonthWindow(now = new Date()) {
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const year = istNow.getFullYear();
  const month = istNow.getMonth();

  const currentStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const nextStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  const prevStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const prevEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  return {
    currentStartIso: currentStart.toISOString(),
    nextStartIso: nextStart.toISOString(),
    prevStartIso: prevStart.toISOString(),
    prevEndIso: prevEnd.toISOString(),
  };
}

function getLastNMonthStarts(n: number, now = new Date()) {
  const rows: Array<{ key: string; label: string }> = [];
  const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth() - i, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('en-IN', { month: 'short' });
    rows.push({ key, label });
  }
  return rows;
}

function initialsFromName(name: string) {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function truncate56(text: string | null | undefined) {
  if (!text) return 'No description';
  return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}

async function getCatalogViewsByCohort(tenantId: string, cohortId: string, fromIso: string, toIso: string) {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

  if (!apiKey || !projectId) return 0;

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
            SELECT count(DISTINCT person_id) AS unique_views
            FROM events
            WHERE event = 'catalog_viewed'
              AND properties.tenant_id = {tenant_id:String}
              AND properties.cohort_id = {cohort_id:String}
              AND timestamp >= toDateTime({from_ts:String})
              AND timestamp < toDateTime({to_ts:String})
          `,
          placeholders: {
            tenant_id: tenantId,
            cohort_id: cohortId,
            from_ts: fromIso,
            to_ts: toIso,
          },
        },
      }),
    });

    if (!response.ok) return 0;
    const payload = (await response.json()) as { results?: Array<[number] | { unique_views: number }> };
    const first = payload.results?.[0];
    if (!first) return 0;
    if (Array.isArray(first)) return Number(first[0] ?? 0);
    return Number(first.unique_views ?? 0);
  } catch {
    return 0;
  }
}

async function getCatalogOpensByCatalog(tenantId: string, catalogIds: string[], fromIso: string, toIso: string) {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

  if (!apiKey || !projectId || catalogIds.length === 0) return new Map<string, number>();

  try {
    const quotedCatalogIds = catalogIds.map((id) => `'${id}'`).join(',');
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
            SELECT properties.catalog_id AS catalog_id, count(DISTINCT person_id) AS unique_views
            FROM events
            WHERE event = 'catalog_viewed'
              AND properties.tenant_id = {tenant_id:String}
              AND properties.catalog_id IN (${quotedCatalogIds})
              AND timestamp >= toDateTime({from_ts:String})
              AND timestamp < toDateTime({to_ts:String})
            GROUP BY properties.catalog_id
          `,
          placeholders: {
            tenant_id: tenantId,
            from_ts: fromIso,
            to_ts: toIso,
          },
        },
      }),
    });

    if (!response.ok) return new Map<string, number>();
    const payload = (await response.json()) as { results?: Array<[string, number] | { catalog_id: string; unique_views: number }> };

    const map = new Map<string, number>();
    for (const row of payload.results ?? []) {
      if (Array.isArray(row)) {
        map.set(String(row[0]), Number(row[1] ?? 0));
      } else {
        map.set(String(row.catalog_id), Number(row.unique_views ?? 0));
      }
    }
    return map;
  } catch {
    return new Map<string, number>();
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as DbClient as any;

  const { data: globalCohort, error: globalCohortError } = await db
    .schema('app')
    .from('cohorts')
    .select('id, tenant_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (globalCohortError) return NextResponse.json({ error: 'Failed to fetch cohort' }, { status: 500 });
  if (!globalCohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
  if (globalCohort.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: cohort, error: cohortError } = await db
    .schema('app')
    .from('cohorts')
    .select('id, tenant_id, name, description, rules, is_static, cached_member_count, created_at, created_by, updated_at')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .single();

  if (cohortError || !cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });

  const [{ data: buyers }, { data: members }, { data: orders }, { data: catalogRowsData }, { data: audits }, { data: catalogItems }, { data: tenantProducts }] = await Promise.all([
    db
      .schema('app')
      .from('buyers')
      .select('id, business_name, tier, geography')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('cohort_members')
      .select('cohort_id, buyer_id')
      .eq('cohort_id', id),
    db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, total_amount, status, placed_at, catalog_id')
      .eq('tenant_id', claims.tenant_id)
      .neq('status', 'cancelled')
      .is('deleted_at', null),
    db
      .schema('app')
      .from('published_catalogs')
      .select('id, scope_type, scope_value, status, name, created_at, updated_at')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('audit_log')
      .select('id, ts, action, entity_type, entity_id, diff')
      .eq('tenant_id', claims.tenant_id)
      .order('ts', { ascending: false })
      .limit(300),
    db
      .schema('app')
      .from('published_catalog_items')
      .select('catalog_id, tenant_product_id')
      .is('deleted_at', null),
    db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null),
  ]);

  const buyerRows = (buyers ?? []) as BuyerRow[];
  const memberRows = members ?? [];
  const orderRows = (orders ?? []) as OrderRow[];
  const catalogRows = (catalogRowsData ?? []) as CatalogRow[];
  const catalogItemRows = (catalogItems ?? []) as CatalogItemRow[];
  const tenantProductRows = (tenantProducts ?? []) as TenantProductRow[];

  const memberBuyerIds = new Set<string>(memberRows.map((row: { buyer_id: string }) => row.buyer_id));
  const totalMembers = cohort.cached_member_count ?? memberBuyerIds.size;
  const buyerById = new Map<string, BuyerRow>(buyerRows.map((row) => [row.id, row]));

  const currentMembers = buyerRows.filter((b) => memberBuyerIds.has(b.id));
  const memberPreview = currentMembers
    .slice(0, 10)
    .map((b) => ({ id: b.id, name: b.business_name, city: b.geography?.city ?? b.geography?.state ?? '—', tier: b.tier ?? '—' }));

  const { currentStartIso, nextStartIso, prevStartIso, prevEndIso } = getIstMonthWindow();

  let gmvMtd = 0;
  let gmvPrev = 0;
  let ordersMtd = 0;
  const activeMembersSet = new Set<string>();
  const monthAgg = new Map<string, { gmv: number; orders: number }>();

  for (const order of orderRows) {
    if (!memberBuyerIds.has(order.buyer_id)) continue;
    if (!order.placed_at) continue;
    const amount = Number(order.total_amount ?? 0);
    const placed = new Date(order.placed_at);
    const placedIso = placed.toISOString();

    const monthKey = `${placed.getUTCFullYear()}-${String(placed.getUTCMonth() + 1).padStart(2, '0')}`;
    const agg = monthAgg.get(monthKey) ?? { gmv: 0, orders: 0 };
    agg.gmv += amount;
    agg.orders += 1;
    monthAgg.set(monthKey, agg);

    if (placedIso >= currentStartIso && placedIso < nextStartIso) {
      gmvMtd += amount;
      ordersMtd += 1;
      activeMembersSet.add(order.buyer_id);
    }
    if (placedIso >= prevStartIso && placedIso < prevEndIso) {
      gmvPrev += amount;
    }
  }

  const growthPct = gmvPrev > 0 ? Number((((gmvMtd - gmvPrev) / gmvPrev) * 100).toFixed(1)) : 0;
  const aov = ordersMtd > 0 ? gmvMtd / ordersMtd : 0;

  const scopedCatalogIds = new Set<string>(
    catalogRows
      .filter((c) => c.scope_type === 'cohort' && c.scope_value?.cohort_id === id)
      .map((c) => c.id),
  );

  const catalogOrdersMtd = orderRows.filter((order) => {
    if (!order.catalog_id || !scopedCatalogIds.has(order.catalog_id)) return false;
    if (!order.placed_at) return false;
    const placedIso = new Date(order.placed_at).toISOString();
    return placedIso >= currentStartIso && placedIso < nextStartIso;
  }).length;

  const uniqueCatalogViews = await getCatalogViewsByCohort(claims.tenant_id, id, currentStartIso, nextStartIso);
  const conversionPct = uniqueCatalogViews > 0 ? Number(((catalogOrdersMtd / uniqueCatalogViews) * 100).toFixed(1)) : 0;

  const twelveMonthKeys = getLastNMonthStarts(12);
  const gmvTrend12m = twelveMonthKeys.map(({ key, label }) => ({ month: label, value: Number((monthAgg.get(key)?.gmv ?? 0).toFixed(2)) }));

  const memberSpendMap = new Map<string, number>();
  for (const order of orderRows) {
    if (!memberBuyerIds.has(order.buyer_id)) continue;
    memberSpendMap.set(order.buyer_id, (memberSpendMap.get(order.buyer_id) ?? 0) + Number(order.total_amount ?? 0));
  }

  const ordersByBuyerMtd = new Map<string, number>();
  for (const order of orderRows) {
    if (!memberBuyerIds.has(order.buyer_id) || !order.placed_at) continue;
    const placedIso = new Date(order.placed_at).toISOString();
    if (placedIso < currentStartIso || placedIso >= nextStartIso) continue;
    ordersByBuyerMtd.set(order.buyer_id, (ordersByBuyerMtd.get(order.buyer_id) ?? 0) + 1);
  }

  const topMembers = currentMembers
    .map((member) => ({
      buyer_id: member.id,
      buyer_name: member.business_name,
      city: member.geography?.city ?? member.geography?.state ?? '—',
      initials: initialsFromName(member.business_name),
      spend_mtd: Number((memberSpendMap.get(member.id) ?? 0).toFixed(2)),
      order_count_mtd: ordersByBuyerMtd.get(member.id) ?? 0,
    }))
    .sort((a, b) => b.spend_mtd - a.spend_mtd)
    .slice(0, 10);

  const dormantMembers = Math.max(0, totalMembers - activeMembersSet.size);

  const scopedCatalogs = catalogRows.filter((c) => c.scope_type === 'cohort' && c.scope_value?.cohort_id === id);
  const scopedCatalogIdSet = new Set(scopedCatalogs.map((c) => c.id));

  const scopedCatalogOrdersMtd = orderRows.filter((order) => {
    if (!order.catalog_id || !scopedCatalogIdSet.has(order.catalog_id) || !order.placed_at) return false;
    const placedIso = new Date(order.placed_at).toISOString();
    return placedIso >= currentStartIso && placedIso < nextStartIso;
  });

  const tenantProductToBrand = new Map<string, string | null>(tenantProductRows.map((row) => [row.id, row.tenant_brand_id]));
  const brandIdsCarried = new Set<string>();
  const catalogProductIdsByCatalog = new Map<string, string[]>();
  for (const row of catalogItemRows) {
    if (!scopedCatalogIdSet.has(row.catalog_id)) continue;
    if (!catalogProductIdsByCatalog.has(row.catalog_id)) catalogProductIdsByCatalog.set(row.catalog_id, []);
    catalogProductIdsByCatalog.get(row.catalog_id)?.push(row.tenant_product_id);
    const brandId = tenantProductToBrand.get(row.tenant_product_id);
    if (brandId) brandIdsCarried.add(brandId);
  }

  const brandIdsSold = new Set<string>();
  for (const order of scopedCatalogOrdersMtd) {
    if (!order.catalog_id) continue;
    const productIds = catalogProductIdsByCatalog.get(order.catalog_id) ?? [];
    for (const productId of productIds) {
      const brandId = tenantProductToBrand.get(productId);
      if (brandId) brandIdsSold.add(brandId);
    }
  }

  const opensByCatalog = await getCatalogOpensByCatalog(
    claims.tenant_id,
    scopedCatalogs.map((c) => c.id),
    currentStartIso,
    nextStartIso,
  );
  const ordersByCatalogMtd = new Map<string, { orders: number; gmv: number }>();
  for (const order of scopedCatalogOrdersMtd) {
    if (!order.catalog_id) continue;
    const current = ordersByCatalogMtd.get(order.catalog_id) ?? { orders: 0, gmv: 0 };
    current.orders += 1;
    current.gmv += Number(order.total_amount ?? 0);
    ordersByCatalogMtd.set(order.catalog_id, current);
  }

  const catalogs = scopedCatalogs
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10)
    .map((catalog) => {
      const stats = ordersByCatalogMtd.get(catalog.id) ?? { orders: 0, gmv: 0 };
      return {
        catalog_id: catalog.id,
        catalog_name: catalog.name,
        sent_at: catalog.updated_at || catalog.created_at,
        opens: opensByCatalog.get(catalog.id) ?? 0,
        orders: stats.orders,
        gmv: Number(stats.gmv.toFixed(2)),
      };
    });

  const activity = (audits ?? [])
    .filter((entry: { entity_id: string; entity_type: string }) => {
      if (entry.entity_id === id) return true;
      if (entry.entity_type === 'cohort_members' || entry.entity_type === 'published_catalog' || entry.entity_type === 'price_list_assignments') {
        return true;
      }
      return false;
    })
    .slice(0, 100)
    .map((entry: { id: string; ts: string; action: string; entity_type: string; entity_id: string; diff: Record<string, unknown> | null }) => ({
      id: entry.id,
      at: entry.ts,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      summary: `${entry.action} ${entry.entity_type}`,
      diff: entry.diff,
    }));

  const createdBy = cohort.created_by ? `Created by user ${String(cohort.created_by).slice(0, 8)}` : 'Created by system';

  return NextResponse.json({
    header: {
      id: cohort.id,
      cohort_name: cohort.name,
      status_label: cohort.is_static ? 'Static' : 'Dynamic',
      status_tone: cohort.is_static ? 'neutral' : 'success',
      initials: initialsFromName(cohort.name),
      hue: cohort.is_static ? 'cream' : 'ember',
      subtitle: {
        members_text: `${totalMembers} of ${buyerRows.length} buyers`,
        description_text: truncate56(cohort.description),
        created_by_text: createdBy,
      },
    },
    meta_strip_4: {
      gmv_mtd: gmvMtd,
      growth_pct: growthPct,
      active_members: activeMembersSet.size,
      total_members: totalMembers,
      aov,
      conversion_pct: conversionPct,
    },
    details_rules: {
      id: cohort.id,
      name: cohort.name,
      description: cohort.description ?? '',
      type: cohort.is_static ? 'Static list' : 'Rule-based',
      is_static: cohort.is_static,
      rules: cohort.rules ?? { filters: [] },
      members_preview: memberPreview,
      updated_at: cohort.updated_at,
    },
    performance: {
      summary: {
        gmv_mtd: gmvMtd,
        growth_pct: growthPct,
        aov,
      },
      engagement: {
        active_members: activeMembersSet.size,
        total_members: totalMembers,
        dormant_members: dormantMembers,
        conversion_pct: conversionPct,
        brands_sold: brandIdsSold.size,
        brands_carried: brandIdsCarried.size,
      },
      top_members: topMembers,
      catalogs,
      gmv_trend_12m: gmvTrend12m,
    },
    activity,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CohortUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 422 });

  const db = supabaseAdmin as DbClient as any;

  const { data: existing } = await db
    .schema('app')
    .from('cohorts')
    .select('id, is_static, rules')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });

  if (parsed.data.name) {
    const { data: nameMatch } = await db
      .schema('app')
      .from('cohorts')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('name', parsed.data.name)
      .is('deleted_at', null)
      .neq('id', id)
      .maybeSingle();
    if (nameMatch) return NextResponse.json({ error: 'A cohort with this name already exists.' }, { status: 409 });
  }

  const nextRules =
    parsed.data.rules !== undefined ? parsed.data.rules : existing.rules;
  const nextIsStatic =
    parsed.data.is_static !== undefined ? parsed.data.is_static : existing.is_static;

  const { data: cohort, error: updateError } = await db
    .schema('app')
    .from('cohorts')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .select()
    .single();

  if (updateError) {
    console.error('[PATCH /api/cohorts/[id]]', updateError.message);
    return NextResponse.json({ error: 'Failed to update cohort' }, { status: 500 });
  }

  try {
    const composer = await getCohortComposerPayload(db, claims.tenant_id);
    const memberIds = resolveBuyerIdsForRules(composer.buyers, nextRules, nextIsStatic);

    const { error: clearError } = await db
      .schema('app')
      .from('cohort_members')
      .delete()
      .eq('cohort_id', id);

    if (clearError) {
      console.error('[PATCH /api/cohorts/[id]] member clear error:', clearError.message);
      return NextResponse.json({ error: 'Failed to refresh cohort members' }, { status: 500 });
    }

    if (memberIds.length > 0) {
      const rows = memberIds.map((buyerId) => ({ cohort_id: id, buyer_id: buyerId }));
      const { error: membersError } = await db
        .schema('app')
        .from('cohort_members')
        .upsert(rows, { onConflict: 'cohort_id,buyer_id' });

      if (membersError) {
        console.error('[PATCH /api/cohorts/[id]] member sync error:', membersError.message);
        return NextResponse.json({ error: 'Failed to refresh cohort members' }, { status: 500 });
      }
    }

    await db
      .schema('app')
      .from('cohorts')
      .update({ cached_member_count: memberIds.length, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    cohort.cached_member_count = memberIds.length;
  } catch (error: any) {
    console.error('[PATCH /api/cohorts/[id]] composer sync error:', error?.message);
    return NextResponse.json({ error: 'Failed to rebuild cohort membership' }, { status: 500 });
  }

  return NextResponse.json({ cohort });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as DbClient as any;

  const { data: cohort } = await db
    .schema('app')
    .from('cohorts')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });

  const { data: activeCatalogs } = await db
    .schema('app')
    .from('published_catalogs')
    .select('id')
    .eq('tenant_id', claims.tenant_id)
    .eq('status', 'published')
    .eq('scope_type', 'cohort')
    .contains('scope_value', { cohort_id: id })
    .is('deleted_at', null);

  if (activeCatalogs && activeCatalogs.length > 0) {
    return NextResponse.json(
      { error: 'This cohort is used in an active catalog. Archive the catalog before deleting the cohort.', code: 'COHORT_IN_USE' },
      { status: 409 },
    );
  }

  const { error: deleteError } = await db
    .schema('app')
    .from('cohorts')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null);

  if (deleteError) {
    console.error('[DELETE /api/cohorts/[id]]', deleteError.message);
    return NextResponse.json({ error: 'Failed to delete cohort' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
