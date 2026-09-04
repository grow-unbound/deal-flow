import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { getAuthUserEmailMap } from '@/lib/server/auth-user-directory';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { PriceListComposerPayloadSchema, PriceListFormPayloadSchema } from '@/lib/zod';
import { revalidatePublicCatalogCache } from '@/lib/server/public-catalog-cache';

type PriceListStatus = 'active' | 'draft' | 'expired';
type PriceListStatusTone = 'success' | 'warning' | 'neutral';

function deriveStatus(validFrom: string | null, validTo: string | null, isActive: boolean): PriceListStatus {
  const now = Date.now();
  const fromTs = validFrom ? new Date(validFrom).getTime() : Number.NEGATIVE_INFINITY;
  const toTs = validTo ? new Date(validTo).getTime() : Number.POSITIVE_INFINITY;
  if (toTs < now) return 'expired';
  if (!isActive) return 'draft';
  if (fromTs > now) return 'draft';
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

async function getTenantProductBasePrices(
  db: any,
  tenantId: string,
  tenantProductIds: string[],
) {
  if (tenantProductIds.length === 0) return [] as Array<{ id: string; base_selling_price: number | null }>;

  const { data, error } = await db
    .schema('app')
    .from('tenant_products')
    .select('id, base_selling_price')
    .eq('tenant_id', tenantId)
    .in('id', tenantProductIds)
    .is('deleted_at', null);

  if (error) {
    throw new Error('Failed to load selected products');
  }

  return (data ?? []) as Array<{ id: string; base_selling_price: number | null }>;
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
    .select('id, tenant_id, name, description, currency, valid_from, valid_to, priority, is_active, pricing_strategy, strategy_value, filters, membership_mode, created_at, updated_at, created_by, updated_by')
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

  // userMap only depends on priceList (already resolved above), not on any of
  // the four queries below -- runs alongside them instead of after.
  const [[itemsRes, assignmentsRes, activityRes, priceListNowRes], userMap] = await Promise.all([
    Promise.all([
      db
        .schema('app')
        .from('price_list_items')
        .select(
          `id, price_list_id, tenant_product_id, price, min_qty, max_qty, created_at, updated_at,
           tenant_product:tenant_products(
             id, internal_sku, name_override, mrp, base_selling_price, cost_price, is_active, master_product_id,
             tenant_brand:tenant_brands(id, display_name_override, master_brand_id)
           )`,
        )
        .eq('price_list_id', id)
        .is('deleted_at', null)
        .order('min_qty', { ascending: true }),
      db
        .schema('app')
        .from('price_list_assignments')
        .select('id, price_list_id, target_type, target_id, created_at')
        .eq('price_list_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      db
        .schema('app')
        .from('audit_log')
        .select('id, ts, action, entity_type, entity_id, actor_user_id, diff')
        .eq('tenant_id', claims.tenant_id)
        .eq('entity_type', 'price_list')
        .eq('entity_id', id)
        .order('ts', { ascending: false })
        .limit(100),
      db
        .schema('app')
        .from('metrics_price_lists_now_summary')
        .select('member_product_count, assigned_cohort_count, assigned_buyer_count, avg_discount_pct, avg_margin_pct')
        .eq('price_list_id', id)
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null)
        .maybeSingle(),
    ]),
    getAuthUserEmailMap([priceList.created_by, priceList.updated_by].filter(Boolean)),
  ]);

  if (itemsRes.error || assignmentsRes.error || activityRes.error || priceListNowRes.error) {
    console.error(
      '[GET /api/price-lists/[id]] related fetch error:',
      itemsRes.error || assignmentsRes.error || activityRes.error || priceListNowRes.error,
    );
    return NextResponse.json({ error: 'Failed to fetch price list details' }, { status: 500 });
  }
  const priceListNow = (priceListNowRes.data ?? null) as {
    member_product_count: number;
    assigned_cohort_count: number;
    assigned_buyer_count: number;
    avg_discount_pct: number;
    avg_margin_pct: number;
  } | null;

  const items = itemsRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];
  const events = activityRes.data ?? [];

  const masterProductIds = Array.from(
    new Set(
      items
        .map((item: { tenant_product?: { master_product_id?: string | null } | null }) => item.tenant_product?.master_product_id)
        .filter(Boolean) as string[],
    ),
  );
  const masterBrandIds = Array.from(
    new Set(
      items
        .map(
          (item: {
            tenant_product?: {
              tenant_brand?: { master_brand_id?: string | null } | null;
            } | null;
          }) => item.tenant_product?.tenant_brand?.master_brand_id,
        )
        .filter(Boolean) as string[],
    ),
  );

  const cohortIds = Array.from(
    new Set(
      assignments
        .filter((assignment: { target_type: string; target_id: string | null }) => assignment.target_type === 'cohort' && assignment.target_id)
        .map((assignment: { target_id: string | null }) => assignment.target_id as string),
    ),
  );

  const buyerIds = Array.from(
    new Set(
      assignments
        .filter((assignment: { target_type: string; target_id: string | null }) => assignment.target_type === 'buyer' && assignment.target_id)
        .map((assignment: { target_id: string | null }) => assignment.target_id as string),
    ),
  );

  // masterProducts/masterBrands derive from items, cohorts/buyers/cohortMembers
  // derive from assignments -- both already resolved above and mutually
  // independent, so all five queries run in one merged Promise.all instead of
  // two sequential ones.
  const [masterProductsRes, masterBrandsRes, cohortsRes, buyersRes, cohortMembersRes] = await Promise.all([
    masterProductIds.length > 0
      ? db.schema('catalog').from('products').select('id, name').in('id', masterProductIds)
      : Promise.resolve({ data: [], error: null }),
    masterBrandIds.length > 0
      ? db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds)
      : Promise.resolve({ data: [], error: null }),
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
          .from('cohort_members_active')
          .select('cohort_id, buyer_id')
          .in('cohort_id', cohortIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (masterProductsRes.error || masterBrandsRes.error || cohortsRes.error || buyersRes.error || cohortMembersRes.error) {
    console.error(
      '[GET /api/price-lists/[id]] denorm error:',
      masterProductsRes.error || masterBrandsRes.error || cohortsRes.error || buyersRes.error || cohortMembersRes.error,
    );
    return NextResponse.json({ error: 'Failed to fetch price list details' }, { status: 500 });
  }

  const masterProductNameMap = new Map(
    (masterProductsRes.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]),
  );
  const masterBrandNameMap = new Map(
    (masterBrandsRes.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]),
  );

  const enrichedItems = items.map(
    (item: {
      id: string;
      price_list_id: string;
      tenant_product_id: string;
      price: number;
      min_qty: number;
      max_qty: number | null;
      created_at: string;
      updated_at: string;
      tenant_product?: {
        id: string;
        internal_sku: string;
        name_override: string | null;
        mrp: number | null;
        base_selling_price: number | null;
        cost_price: number | null;
        is_active: boolean;
        master_product_id?: string | null;
        tenant_brand?: {
          id: string;
          display_name_override: string | null;
          master_brand_id?: string | null;
        } | null;
      } | null;
    }) => ({
      ...item,
      tenant_product: item.tenant_product
        ? {
            ...item.tenant_product,
            cost_price: claims.role === 'seller_admin' ? item.tenant_product.cost_price ?? null : null,
            tenant_brand: item.tenant_product.tenant_brand
              ? {
                  id: item.tenant_product.tenant_brand.id,
                  display_name_override: item.tenant_product.tenant_brand.display_name_override,
                  master_brand: item.tenant_product.tenant_brand.master_brand_id
                    ? { name: masterBrandNameMap.get(item.tenant_product.tenant_brand.master_brand_id) ?? 'Unknown brand' }
                    : null,
                }
              : null,
            master_product: item.tenant_product.master_product_id
              ? { name: masterProductNameMap.get(item.tenant_product.master_product_id) ?? 'Unknown product' }
              : null,
          }
        : null,
    }),
  );

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
  for (const item of enrichedItems) {
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

  return NextResponse.json({
    price_list: {
      ...priceList,
      status,
      status_label: statusInfo.label,
      status_tone: statusInfo.tone,
      initials: initialsFromName(priceList.name),
      created_by_label: priceList.created_by ? userMap.get(priceList.created_by) ?? 'Team member' : 'Team member',
      items: enrichedItems,
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
        products_covered: priceListNow?.member_product_count ?? enrichedItems.length,
        brands_covered: brandSet.size,
        assignments_count: assignments.length,
        assigned_buyer_count: priceListNow?.assigned_buyer_count ?? 0,
        assigned_cohort_count: priceListNow?.assigned_cohort_count ?? 0,
        avg_discount_pct: priceListNow?.avg_discount_pct ?? avgDiscountPct,
        avg_margin_pct: priceListNow?.avg_margin_pct ?? 0,
        days_left: daysLeft,
      },
    },
  }, { headers: SELLER_CACHE_PERSONAL });
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

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
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

    revalidatePublicCatalogCache(claims.tenant_id);
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

    revalidatePublicCatalogCache(claims.tenant_id);
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

    revalidatePublicCatalogCache(claims.tenant_id);
    return NextResponse.json({ price_list: data });
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
  const payload: any = isSimpleForm ? simpleParsed.data : composerParsed!.data;
  if (!isSimpleForm && payload.save_mode === 'publish' && payload.item_prices.length === 0) {
    return NextResponse.json({ error: 'Add at least one product before publishing.' }, { status: 422 });
  }

  const { data: existingPriceList, error: existingError } = await db
    .schema('app')
    .from('price_lists')
    .select('id, external_ref')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: 'Failed to load price list' }, { status: 500 });
  }

  if (!existingPriceList) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  // Externally-sourced price lists (Zoho import): membership and pricing come
  // exclusively from the sync — the manual product-picker save path would
  // overwrite Zoho items/rates with locally-computed ones.
  if (existingPriceList.external_ref) {
    return NextResponse.json(
      { error: 'This price list is managed by your Zoho integration. Products and prices sync automatically — edit them in Zoho.' },
      { status: 409 },
    );
  }

  const simpleMembershipMode = isSimpleForm ? payload.membership_mode : undefined;

  if (!isSimpleForm) {
    const tenantProductIds = payload.item_prices.map((item: any) => item.tenant_product_id);

    let validProductIds: Set<string>;
    try {
      validProductIds = await ensureTenantProducts(db, claims.tenant_id, tenantProductIds);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to validate selected products' }, { status: 500 });
    }

    if (validProductIds.size !== tenantProductIds.length) {
      return NextResponse.json({ error: 'One or more selected products are invalid.' }, { status: 422 });
    }
  } else if (simpleMembershipMode === 'manual') {
    let validProductIds: Set<string>;
    try {
      validProductIds = await ensureTenantProducts(db, claims.tenant_id, payload.selected_product_ids);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to validate selected products' }, { status: 500 });
    }

    if (validProductIds.size !== payload.selected_product_ids.length) {
      return NextResponse.json({ error: 'One or more selected products are invalid.' }, { status: 422 });
    }
  }

  const { error: updateError } = await db
    .schema('app')
    .from('price_lists')
    .update({
      name: payload.name,
      description: payload.description?.trim() ? payload.description.trim() : null,
      valid_from: payload.valid_from.toISOString(),
      valid_to: payload.valid_to ? payload.valid_to.toISOString() : null,
      priority: payload.priority,
      ...(!isSimpleForm ? { currency: payload.currency } : {}),
      ...(!isSimpleForm ? { is_active: payload.save_mode === 'publish' } : {}),
      pricing_strategy: payload.pricing_strategy,
      strategy_value: payload.pricing_strategy === 'edit_each' ? null : (payload.strategy_value ?? null),
      ...(!isSimpleForm ? { filters: payload.filters } : {}),
      ...(isSimpleForm && simpleMembershipMode !== undefined ? {
        membership_mode: simpleMembershipMode,
        filters: simpleMembershipMode === 'automatic' ? payload.rules : { brand_names: [], category_names: [], availability: 'show_all' },
      } : {}),
      updated_by: claims.sub,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update price list', detail: updateError.message }, { status: 500 });
  }

  if (isSimpleForm) {
    if (simpleMembershipMode === 'automatic') {
      // Mode switch or rule edit -- recompute now (requirement 4).
      const { error: refreshError } = await db.schema('app').rpc('refresh_price_list_by_id', { p_price_list_id: id });
      if (refreshError) {
        console.error('[PATCH /api/price-lists/[id]] refresh error:', refreshError.message);
      }
    }

    const { data: updatedPriceList, error: updatedPriceListError } = await db
      .schema('app')
      .from('price_lists')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    if (updatedPriceListError) {
      return NextResponse.json({ error: 'Price list updated but refresh failed' }, { status: 500 });
    }

    if (simpleMembershipMode === 'manual') {
      let selectedProducts: Array<{ id: string; base_selling_price: number | null }>;
      try {
        selectedProducts = await getTenantProductBasePrices(db, claims.tenant_id, payload.selected_product_ids);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load selected products' }, { status: 500 });
      }

      if (selectedProducts.some((product) => Number(product.base_selling_price ?? 0) <= 0)) {
        return NextResponse.json({ error: 'Every selected product needs a base selling price before it can be added.' }, { status: 422 });
      }

      const { data: existingSimpleItems, error: existingSimpleItemsError } = await db
        .schema('app')
        .from('price_list_items')
        .select('id, tenant_product_id, min_qty, deleted_at')
        .eq('price_list_id', id);

      if (existingSimpleItemsError) {
        return NextResponse.json({ error: 'Failed to sync selected products', detail: existingSimpleItemsError.message }, { status: 500 });
      }

      const existingSimpleByKey = new Map<string, { id: string; tenant_product_id: string; min_qty: number; deleted_at: string | null }>(
        (existingSimpleItems ?? []).map((item: { id: string; tenant_product_id: string; min_qty: number; deleted_at: string | null }) => [
          `${item.tenant_product_id}:${item.min_qty}`,
          item,
        ]),
      );

      const nextSet = new Set(payload.selected_product_ids);
      const idsToSoftDelete = (existingSimpleItems ?? [])
        .filter((item: { tenant_product_id: string; min_qty: number; deleted_at: string | null }) => item.min_qty === 1 && !item.deleted_at && !nextSet.has(item.tenant_product_id))
        .map((item: { id: string }) => item.id);

      if (idsToSoftDelete.length > 0) {
        const { error: softDeleteError } = await db
          .schema('app')
          .from('price_list_items')
          .update({
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: claims.sub,
          })
          .in('id', idsToSoftDelete);
        if (softDeleteError) {
          return NextResponse.json({ error: 'Failed to remove unselected products', detail: softDeleteError.message }, { status: 500 });
        }
      }

      for (const product of selectedProducts) {
        const existingItem = existingSimpleByKey.get(`${product.id}:1`);
        if (existingItem) {
          const { error: itemUpdateError } = await db
            .schema('app')
            .from('price_list_items')
            .update({
              price: Number(product.base_selling_price ?? 0),
              max_qty: null,
              deleted_at: null,
              updated_at: new Date().toISOString(),
              updated_by: claims.sub,
            })
            .eq('id', existingItem.id);
          if (itemUpdateError) {
            return NextResponse.json({ error: 'Failed to update selected products', detail: itemUpdateError.message }, { status: 500 });
          }
          continue;
        }

        const { error: itemInsertError } = await db
          .schema('app')
          .from('price_list_items')
          .insert({
            price_list_id: id,
            tenant_product_id: product.id,
            price: Number(product.base_selling_price ?? 0),
            min_qty: 1,
            max_qty: null,
            created_by: claims.sub,
            updated_by: claims.sub,
            deleted_at: null,
          });
        if (itemInsertError) {
          return NextResponse.json({ error: 'Failed to add selected products', detail: itemInsertError.message }, { status: 500 });
        }
      }

      if (payload.pricing_strategy !== 'edit_each') {
        const { error: applyError } = await db.schema('app').rpc('apply_price_list_pricing_strategy', { p_price_list_id: id });
        if (applyError) {
          console.error('[PATCH /api/price-lists/[id]] apply pricing strategy error:', applyError.message);
        }
      }
    }

    revalidatePublicCatalogCache(claims.tenant_id);
    return NextResponse.json({ price_list: updatedPriceList as Record<string, unknown> & { id: string } });
  }

  const { data: existingItems, error: existingItemsError } = await db
    .schema('app')
    .from('price_list_items')
    .select('id, tenant_product_id, min_qty, deleted_at')
    .eq('price_list_id', id);

  if (existingItemsError) {
    return NextResponse.json({ error: 'Failed to sync price list items', detail: existingItemsError.message }, { status: 500 });
  }

  const existingByKey = new Map<string, { id: string; tenant_product_id: string; min_qty: number; deleted_at: string | null }>(
    (existingItems ?? []).map((item: { id: string; tenant_product_id: string; min_qty: number; deleted_at: string | null }) => [
      `${item.tenant_product_id}:${item.min_qty}`,
      item,
    ]),
  );
  const submittedKeys = new Set(payload.item_prices.map((item: any) => `${item.tenant_product_id}:${item.min_qty}`));

  const idsToSoftDelete = (existingItems ?? [])
    .filter((item: { tenant_product_id: string; min_qty: number; deleted_at: string | null }) => !item.deleted_at && !submittedKeys.has(`${item.tenant_product_id}:${item.min_qty}`))
    .map((item: { id: string }) => item.id);

  if (idsToSoftDelete.length > 0) {
    const { error: softDeleteError } = await db
      .schema('app')
      .from('price_list_items')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: claims.sub,
      })
      .in('id', idsToSoftDelete);

    if (softDeleteError) {
      return NextResponse.json({ error: 'Failed to remove unselected products', detail: softDeleteError.message }, { status: 500 });
    }
  }

  for (const item of payload.item_prices) {
    const key = `${item.tenant_product_id}:${item.min_qty}`;
    const existingItem = existingByKey.get(key);

    if (existingItem) {
      const { error: itemUpdateError } = await db
        .schema('app')
        .from('price_list_items')
        .update({
          price: item.price,
          max_qty: item.max_qty ?? null,
          deleted_at: null,
          updated_at: new Date().toISOString(),
          updated_by: claims.sub,
        })
        .eq('id', existingItem.id);

      if (itemUpdateError) {
        return NextResponse.json({ error: 'Failed to update selected products', detail: itemUpdateError.message }, { status: 500 });
      }

      continue;
    }

    const { error: itemInsertError } = await db
      .schema('app')
      .from('price_list_items')
      .insert({
        price_list_id: id,
        tenant_product_id: item.tenant_product_id,
        price: item.price,
        min_qty: item.min_qty,
        max_qty: item.max_qty ?? null,
        created_by: claims.sub,
        updated_by: claims.sub,
        deleted_at: null,
      });

    if (itemInsertError) {
      return NextResponse.json({ error: 'Failed to add selected products', detail: itemInsertError.message }, { status: 500 });
    }
  }

  await db.schema('app').from('audit_log').insert({
    tenant_id: claims.tenant_id,
    actor_user_id: claims.sub,
    entity_type: 'price_list',
      entity_id: id,
    action: payload.save_mode === 'publish' ? 'publish' : 'update',
    diff: {
      event: payload.save_mode === 'publish' ? 'price_list_published' : 'price_list_draft_saved',
      item_count: payload.item_prices.length,
      pricing_strategy: payload.pricing_strategy,
    },
    ts: new Date().toISOString(),
  });

  const { data: updatedPriceList, error: updatedPriceListError } = await db
    .schema('app')
    .from('price_lists')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .maybeSingle();

  if (updatedPriceListError) {
    return NextResponse.json({ error: 'Price list updated but refresh failed' }, { status: 500 });
  }

  revalidatePublicCatalogCache(claims.tenant_id);
  return NextResponse.json({ price_list: updatedPriceList as Record<string, unknown> & { id: string } });
}
