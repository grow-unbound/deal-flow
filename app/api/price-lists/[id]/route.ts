import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';

type PriceListStatus = 'active' | 'draft' | 'expired';
type PriceListStatusTone = 'success' | 'warning' | 'neutral';

function deriveStatus(validFrom: string | null, validTo: string | null, isActive: boolean): PriceListStatus {
  if (!isActive) return 'expired';
  const now = Date.now();
  const fromTs = validFrom ? new Date(validFrom).getTime() : Number.NEGATIVE_INFINITY;
  const toTs = validTo ? new Date(validTo).getTime() : Number.POSITIVE_INFINITY;
  if (fromTs > now) return 'draft';
  if (toTs < now) return 'expired';
  return 'active';
}

function statusMeta(status: PriceListStatus): { label: 'Active' | 'Draft' | 'Expired'; tone: PriceListStatusTone } {
  if (status === 'active') return { label: 'Active', tone: 'success' };
  if (status === 'draft') return { label: 'Draft', tone: 'warning' };
  return { label: 'Expired', tone: 'neutral' };
}

function initialsFromName(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: priceList, error: plError } = await db
    .schema('app')
    .from('price_lists')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (plError) {
    console.error('[GET /api/price-lists/[id]] DB error:', plError.code, plError.message);
    return NextResponse.json(
      { error: 'Failed to fetch price list', code: plError.code, detail: plError.message },
      { status: 500 },
    );
  }

  if (!priceList) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  const [itemsRes, assignmentsRes, activityRes, usersRes] = await Promise.all([
    db
      .schema('app')
      .from('price_list_items')
      .select(
        `id, price_list_id, tenant_product_id, price, min_qty, max_qty, created_at, updated_at,
         tenant_product:tenant_products(
           id, internal_sku, name_override, base_selling_price, is_active,
           tenant_brand:tenant_brands(id, display_name_override, master_brand:catalog.brands(name)),
           master_product:catalog.products(name)
         )`,
      )
      .eq('price_list_id', id)
      .is('deleted_at', null)
      .order('min_qty', { ascending: true }),
    db
      .schema('app')
      .from('price_list_assignments')
      .select('*')
      .eq('price_list_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    db
      .schema('app')
      .from('audit_log')
      .select('*')
      .eq('tenant_id', claims.tenant_id)
      .eq('entity_type', 'price_list')
      .eq('entity_id', id)
      .order('ts', { ascending: false })
      .limit(100),
    db
      .schema('auth')
      .from('users')
      .select('id, email')
      .in('id', [priceList.created_by, priceList.updated_by].filter(Boolean)),
  ]);

  if (itemsRes.error || assignmentsRes.error || activityRes.error || usersRes.error) {
    console.error(
      '[GET /api/price-lists/[id]] related fetch error:',
      itemsRes.error || assignmentsRes.error || activityRes.error || usersRes.error,
    );
    return NextResponse.json({ error: 'Failed to fetch price list details' }, { status: 500 });
  }

  const items = itemsRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];
  const events = activityRes.data ?? [];
  const users = usersRes.data ?? [];

  const cohortIds = assignments
    .filter((assignment: { target_type: string; target_id: string | null }) => assignment.target_type === 'cohort' && assignment.target_id)
    .map((assignment: { target_id: string | null }) => assignment.target_id as string);

  const buyerIds = assignments
    .filter((assignment: { target_type: string; target_id: string | null }) => assignment.target_type === 'buyer' && assignment.target_id)
    .map((assignment: { target_id: string | null }) => assignment.target_id as string);

  const [cohortsRes, buyersRes, cohortMembersRes] = await Promise.all([
    cohortIds.length > 0
      ? db
          .schema('app')
          .from('cohorts')
          .select('id, name')
          .in('id', cohortIds)
          .eq('tenant_id', claims.tenant_id)
      : Promise.resolve({ data: [], error: null }),
    buyerIds.length > 0
      ? db
          .schema('app')
          .from('buyers')
          .select('id, business_name')
          .in('id', buyerIds)
          .eq('tenant_id', claims.tenant_id)
      : Promise.resolve({ data: [], error: null }),
    cohortIds.length > 0
      ? db
          .schema('app')
          .from('cohort_members')
          .select('cohort_id, buyer_id')
          .in('cohort_id', cohortIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (cohortsRes.error || buyersRes.error || cohortMembersRes.error) {
    console.error('[GET /api/price-lists/[id]] assignment denorm error:', cohortsRes.error || buyersRes.error || cohortMembersRes.error);
    return NextResponse.json({ error: 'Failed to fetch assignment details' }, { status: 500 });
  }

  const cohorts = cohortsRes.data ?? [];
  const buyers = buyersRes.data ?? [];
  const cohortMembers = cohortMembersRes.data ?? [];

  const cohortNameMap = new Map(cohorts.map((cohort: { id: string; name: string }) => [cohort.id, cohort.name]));
  const buyerNameMap = new Map(buyers.map((buyer: { id: string; business_name: string }) => [buyer.id, buyer.business_name]));
  const memberCountMap = new Map<string, number>();
  for (const row of cohortMembers as Array<{ cohort_id: string; buyer_id: string }>) {
    memberCountMap.set(row.cohort_id, (memberCountMap.get(row.cohort_id) ?? 0) + 1);
  }

  const status = deriveStatus(priceList.valid_from, priceList.valid_to, priceList.is_active);
  const statusInfo = statusMeta(status);

  const brandSet = new Set<string>();
  let discountAccumulator = 0;
  let discountCount = 0;
  for (const item of items) {
    const brandName = item.tenant_product?.tenant_brand?.display_name_override ?? item.tenant_product?.tenant_brand?.master_brand?.name;
    if (brandName) brandSet.add(brandName);
    const base = Number(item.tenant_product?.base_selling_price ?? 0);
    if (base > 0) {
      discountAccumulator += ((base - Number(item.price)) / base) * 100;
      discountCount += 1;
    }
  }

  const avgDiscountPct = discountCount > 0 ? Math.round((discountAccumulator / discountCount) * 10) / 10 : 0;
  const daysLeft = priceList.valid_to ? Math.max(0, Math.ceil((new Date(priceList.valid_to).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

  const userMap = new Map(users.map((user: { id: string; email: string | null }) => [user.id, user.email ?? 'Team member']));

  return NextResponse.json({
    price_list: {
      ...priceList,
      status,
      status_label: statusInfo.label,
      status_tone: statusInfo.tone,
      initials: initialsFromName(priceList.name),
      created_by_label: priceList.created_by ? userMap.get(priceList.created_by) ?? 'Team member' : 'Team member',
      items,
      assignments: assignments.map((assignment: { id: string; target_type: string; target_id: string | null; created_at: string }) => {
        const label = assignment.target_type === 'cohort'
          ? (assignment.target_id ? cohortNameMap.get(assignment.target_id) ?? 'Unknown cohort' : 'Unknown cohort')
          : assignment.target_type === 'buyer'
            ? (assignment.target_id ? buyerNameMap.get(assignment.target_id) ?? 'Unknown buyer' : 'Unknown buyer')
            : 'All buyers';
        const members = assignment.target_type === 'cohort' && assignment.target_id
          ? memberCountMap.get(assignment.target_id) ?? 0
          : assignment.target_type === 'buyer'
            ? 1
            : 0;
        const priority = Number(priceList.priority ?? 0);

        return {
          ...assignment,
          label,
          members,
          priority,
        };
      }),
      activity: events,
      stats: {
        products_covered: items.length,
        brands_covered: brandSet.size,
        assignments_count: assignments.length,
        avg_discount_pct: avgDiscountPct,
        days_left: daysLeft,
      },
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden: seller_admin required' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_pricing_engine', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  if (body.action === 'duplicate') {
    const { data, error } = await db.schema('app').rpc('price_list_duplicate', {
      p_tenant_id: claims.tenant_id,
      p_price_list_id: id,
      p_actor_user_id: claims.sub,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ price_list: data });
  }

  if (body.action === 'extend_validity') {
    if (!body.valid_to) {
      return NextResponse.json({ error: 'valid_to is required' }, { status: 422 });
    }

    const { data, error } = await db.schema('app').rpc('price_list_extend_validity', {
      p_tenant_id: claims.tenant_id,
      p_price_list_id: id,
      p_valid_to: body.valid_to,
      p_actor_user_id: claims.sub,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ price_list: data });
  }

  if (body.action === 'archive') {
    const { data, error } = await db.schema('app').rpc('price_list_archive', {
      p_tenant_id: claims.tenant_id,
      p_price_list_id: id,
      p_actor_user_id: claims.sub,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ price_list: data });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
