import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { createTimer } from '@/lib/server-timing';
import { getAuthUserEmailMap } from '@/lib/server/auth-user-directory';
import { readArrayParam } from '@/lib/landing-filter-params';
import { formatStrategySummary } from '@/lib/price-list-strategy';
import { PriceListComposerPayloadSchema, type PriceListFilterState } from '@/lib/zod';

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

type PriceListItemRow = {
  id: string;
  price_list_id: string;
  tenant_product_id: string;
  price: number;
};

type PriceListAssignmentRow = {
  id: string;
  price_list_id: string;
  target_type: 'buyer' | 'cohort' | 'all_buyers';
  target_id: string | null;
};

type CohortRow = {
  id: string;
  name: string;
};

type CohortMemberRow = {
  cohort_id: string;
  buyer_id: string;
};

type TenantProductRow = {
  id: string;
  base_selling_price: number | null;
  cost_price: number | null;
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
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('price_lists_api'));
    return response;
  };
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
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
  const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
  const statusFilter = readArrayParam(request.nextUrl.searchParams, 'status');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const [priceListsRes, tenantProductsRes, cohortsRes] = await Promise.all([
    db
      .schema('app')
      .from('price_lists')
      .select('id, tenant_id, name, description, currency, valid_from, valid_to, priority, is_active, pricing_strategy, strategy_value, filters, created_at, updated_at, created_by')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(500), // safety cap — this route has no pagination UI yet, fetches the full list
    db
      .schema('app')
      .from('tenant_products')
      .select('id, base_selling_price, cost_price')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('cohorts')
      .select('id, name')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null),
  ]);

  if (
    priceListsRes.error ||
    tenantProductsRes.error ||
    cohortsRes.error
  ) {
    console.error(
      '[GET /api/price-lists] query error:',
      priceListsRes.error || tenantProductsRes.error || cohortsRes.error,
    );
    return timedJson({ error: 'Failed to fetch price lists' }, { status: 500 });
  }

  const priceLists = (priceListsRes.data ?? []) as PriceListRow[];
  const priceListIds = priceLists.map((pl) => pl.id);
  const priceListIdSet = new Set(priceListIds);

  let allItems: PriceListItemRow[] = [];
  let allAssignments: PriceListAssignmentRow[] = [];

  if (priceListIds.length > 0) {
    const [priceListItemsRes, assignmentsRes] = await Promise.all([
      db
        .schema('app')
        .from('price_list_items')
        .select('id, price_list_id, tenant_product_id, price')
        .in('price_list_id', priceListIds)
        .is('deleted_at', null),
      db
        .schema('app')
        .from('price_list_assignments')
        .select('id, price_list_id, target_type, target_id')
        .in('price_list_id', priceListIds)
        .is('deleted_at', null),
    ]);

    if (priceListItemsRes.error || assignmentsRes.error) {
      console.error('[GET /api/price-lists] item/assignment query error:', priceListItemsRes.error || assignmentsRes.error);
      return timedJson({ error: 'Failed to fetch price lists' }, { status: 500 });
    }

    allItems = (priceListItemsRes.data ?? []) as PriceListItemRow[];
    allAssignments = (assignmentsRes.data ?? []) as PriceListAssignmentRow[];
  }

  const tenantProducts = (tenantProductsRes.data ?? []) as TenantProductRow[];
  const cohorts = (cohortsRes.data ?? []) as CohortRow[];
  const cohortIds = cohorts.map((c) => c.id);

  let cohortMembers: CohortMemberRow[] = [];
  if (cohortIds.length > 0) {
    const cohortMembersRes = await db
      .schema('app')
      .from('cohort_members')
      .select('cohort_id, buyer_id')
      .in('cohort_id', cohortIds);

    if (cohortMembersRes.error) {
      console.error('[GET /api/price-lists] cohort_members query error:', cohortMembersRes.error);
      return timedJson({ error: 'Failed to fetch price lists' }, { status: 500 });
    }

    cohortMembers = (cohortMembersRes.data ?? []) as CohortMemberRow[];
  }

  const createdByIds = Array.from(
    new Set(priceLists.map((pl) => pl.created_by).filter((id): id is string => Boolean(id))),
  );

  const createdByMap = await getAuthUserEmailMap(createdByIds);

  const productBaseMap = new Map(tenantProducts.map((row) => [row.id, Number(row.base_selling_price ?? 0)]));
  const productCostMap = new Map(
    tenantProducts.map((row) => [row.id, row.cost_price != null ? Number(row.cost_price) : null]),
  );
  const canViewCost = claims.role === 'seller_admin';
  const cohortNameById = new Map(cohorts.map((cohort) => [cohort.id, cohort.name]));

  const memberSetByCohort = new Map<string, Set<string>>();
  for (const row of cohortMembers) {
    if (!memberSetByCohort.has(row.cohort_id)) memberSetByCohort.set(row.cohort_id, new Set());
    memberSetByCohort.get(row.cohort_id)?.add(row.buyer_id);
  }

  const itemsByList = new Map<string, PriceListItemRow[]>();
  for (const item of allItems) {
    if (!itemsByList.has(item.price_list_id)) itemsByList.set(item.price_list_id, []);
    itemsByList.get(item.price_list_id)?.push(item);
  }

  const assignmentsByList = new Map<string, PriceListAssignmentRow[]>();
  for (const assignment of allAssignments) {
    if (!assignmentsByList.has(assignment.price_list_id)) assignmentsByList.set(assignment.price_list_id, []);
    assignmentsByList.get(assignment.price_list_id)?.push(assignment);
  }

  const activeLists = priceLists.filter((pl) => deriveStatus(pl, nowTs) === 'active');
  const draftLists = priceLists.filter((pl) => deriveStatus(pl, nowTs) === 'draft');
  const expiredLists = priceLists.filter((pl) => deriveStatus(pl, nowTs) === 'expired');

  const expiringSoonLists = activeLists
    .filter((pl) => isExpiringSoon(pl, nowTs, withinSevenDaysTs))
    .sort((a, b) => new Date(a.valid_to ?? '').getTime() - new Date(b.valid_to ?? '').getTime());

  const activeCohortCoverage = new Set<string>();
  for (const pl of activeLists) {
    const assignments = assignmentsByList.get(pl.id) ?? [];
    for (const assignment of assignments) {
      if (assignment.target_type === 'cohort' && assignment.target_id) {
        activeCohortCoverage.add(assignment.target_id);
      }
    }
  }

  let productsWithOverrides = 0;
  for (const item of allItems) {
    const base = productBaseMap.get(item.tenant_product_id);
    if (base == null) continue;
    if (Number(item.price) !== Number(base)) {
      productsWithOverrides += 1;
    }
  }

  const rowModels = priceLists.map((pl) => {
    const status = deriveStatus(pl, nowTs);
    const items = itemsByList.get(pl.id) ?? [];
    const assignments = assignmentsByList.get(pl.id) ?? [];

    const cohortIds = assignments
      .filter((assignment) => assignment.target_type === 'cohort' && assignment.target_id)
      .map((assignment) => assignment.target_id as string);
    const distinctCohortIds = Array.from(new Set(cohortIds));
    const cohortNames = distinctCohortIds.map((id) => cohortNameById.get(id)).filter((name): name is string => Boolean(name));

    let discountAccumulator = 0;
    let discountCount = 0;
    let marginAccumulator = 0;
    let marginCount = 0;
    for (const item of items) {
      const base = productBaseMap.get(item.tenant_product_id);
      if (!base || base <= 0) continue;
      const pct = ((base - Number(item.price)) / base) * 100;
      discountAccumulator += pct;
      discountCount += 1;

      if (canViewCost) {
        const list = Number(item.price);
        const cost = productCostMap.get(item.tenant_product_id);
        if (list > 0 && cost != null && cost > 0) {
          marginAccumulator += ((list - cost) / list) * 100;
          marginCount += 1;
        }
      }
    }

    const avgDiscountPct = discountCount > 0 ? Math.round((discountAccumulator / discountCount) * 10) / 10 : null;
    const avgMarginPct =
      canViewCost && marginCount > 0 ? Math.round((marginAccumulator / marginCount) * 10) / 10 : null;

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
      cohorts_count: distinctCohortIds.length,
      cohort_names: cohortNames,
      product_count: items.length,
      avg_discount_pct: avgDiscountPct,
      avg_margin_pct: avgMarginPct,
      created_by_label: pl.created_by ? createdByMap.get(pl.created_by) ?? 'Team member' : 'Team member',
      is_expiring_soon: isExpiringSoon(pl, nowTs, withinSevenDaysTs),
      pricing_strategy: pl.pricing_strategy,
      strategy_value: pl.strategy_value,
    };
  });

  const filteredRows = rowModels.filter((row) => {
    const statusOk =
      statusFilter.length === 0 ||
      statusFilter.some((value) => {
        if (value === 'Active') return row.status === 'active';
        if (value === 'Draft') return row.status === 'draft';
        if (value === 'Expired') return row.status === 'expired';
        return false;
      });
    const searchOk =
      !search ||
      [row.name, row.description ?? '', row.cohort_names.join(' '), row.created_by_label, formatStrategySummary(row.pricing_strategy, row.strategy_value)]
        .some((value) => value.toLowerCase().includes(search));
    return statusOk && searchOk;
  });

  const mostCoverage = [...rowModels]
    .sort((a, b) => b.product_count - a.product_count)
    .slice(0, 2);

  const uncoveredCohorts = cohorts
    .filter((cohort) => !activeCohortCoverage.has(cohort.id))
    .map((cohort) => ({
      id: cohort.id,
      name: cohort.name,
      member_count: memberSetByCohort.get(cohort.id)?.size ?? 0,
    }))
    .sort((a, b) => b.member_count - a.member_count)
    .slice(0, 3);

  return timedJson({
    kpis: {
      active_lists: activeLists.length,
      draft_lists: draftLists.length,
      expiring_soon: expiringSoonLists.length,
      cohorts_covered: activeCohortCoverage.size,
      cohorts_total: cohorts.length,
      products_with_overrides: productsWithOverrides,
    },
    todays_read: {
      expiring_soon: expiringSoonLists.slice(0, 3).map((pl) => {
        const assignments = assignmentsByList.get(pl.id) ?? [];
        const cohortCount = assignments.filter((row) => row.target_type === 'cohort' && row.target_id).length;
        return {
          id: pl.id,
          name: pl.name,
          initials: toInitials(pl.name),
          valid_until: pl.valid_to,
          valid_until_label: fmtDate(pl.valid_to),
          cohorts_count: cohortCount,
          status: deriveStatus(pl, nowTs),
          status_tone: statusTone(deriveStatus(pl, nowTs)),
        };
      }),
      most_coverage: mostCoverage.map((row) => ({
        id: row.id,
        name: row.name,
        initials: toInitials(row.name),
        product_count: row.product_count,
        valid_until: row.valid_to,
        valid_until_label: fmtDate(row.valid_to),
      })),
      uncovered_cohorts: uncoveredCohorts.map((cohort) => ({
        id: cohort.id,
        name: cohort.name,
        initials: toInitials(cohort.name),
        member_count: cohort.member_count,
      })),
    },
      price_lists: filteredRows,
    cohorts_total: cohorts.length,
    counts: {
      active: activeLists.length,
      draft: draftLists.length,
      expired: expiredLists.length,
    },
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

  const parsed = PriceListComposerPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
      { status: 422 },
    );
  }

  const data = parsed.data;
  if (data.save_mode === 'publish' && data.item_prices.length === 0) {
    return NextResponse.json({ error: 'Add at least one product before publishing.' }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const tenantProductIds = data.item_prices.map((item) => item.tenant_product_id);

  let validProductIds: Set<string>;
  try {
    validProductIds = await ensureTenantProducts(db, claims.tenant_id, tenantProductIds);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to validate selected products' }, { status: 500 });
  }

  if (validProductIds.size !== tenantProductIds.length) {
    return NextResponse.json({ error: 'One or more selected products are invalid.' }, { status: 422 });
  }

  const { data: priceList, error: insertError } = await db
    .schema('app')
    .from('price_lists')
    .insert({
      tenant_id: claims.tenant_id,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      currency: data.currency,
      valid_from: data.valid_from.toISOString(),
      valid_to: data.valid_to ? data.valid_to.toISOString() : null,
      priority: data.priority,
      is_active: data.save_mode === 'publish',
      pricing_strategy: data.pricing_strategy,
      strategy_value: data.pricing_strategy === 'edit_each' ? null : (data.strategy_value ?? null),
      filters: data.filters,
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

  if (data.item_prices.length > 0) {
    const { error: itemsError } = await db
      .schema('app')
      .from('price_list_items')
      .insert(
        data.item_prices.map((item) => ({
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
      event: data.save_mode === 'publish' ? 'price_list_published' : 'price_list_draft_saved',
      item_count: data.item_prices.length,
      pricing_strategy: data.pricing_strategy,
    },
    ts: new Date().toISOString(),
  });

  return NextResponse.json({ price_list: priceList }, { status: 201 });
}
