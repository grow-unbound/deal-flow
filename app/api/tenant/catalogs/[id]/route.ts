import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getPostHogClient } from '@/lib/posthog-server';
import { revalidateSellerDashboardCache } from '@/lib/server/dashboard-cache';
import {
  resolveCampaignWorkflowStatus,
  type CampaignWorkflowStatusLabel,
  type CampaignWorkflowStatusTone,
  type RawCampaignStatus,
} from '@/lib/campaign-workflow-status';
import { getCatalogComposerPayload } from '@/lib/server/catalog-composer';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import {
  aggregateCampaignViewsByCampaign,
  computeCampaignAttributedMetrics,
  computeCampaignViewMetrics,
  filterLineItemsByMembershipWindow,
  getCampaignBuyerOpenedStatus,
  groupLineItemsByParent,
  isEligibleCampaignEstimate,
  isEligibleCampaignOrder,
  rollupSkuMetrics,
  type CampaignEstimateRow,
  type CampaignItemMembershipWindow,
  type CampaignOrderRow,
  type CampaignViewRow,
} from '@/lib/server/campaign-performance';
import { getInAppCreateFlags } from '@/lib/server/seller-features';
import {
  queueCampaignFollowupNotify,
  queueCampaignPublishNotify,
} from '@/lib/server/campaign-publish-notify';
import { runCampaignPublishPreflight } from '@/lib/server/campaign-publish-preflight';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import {
  CatalogNotifyBuyersActionSchema,
  CatalogPublishUpdatesActionSchema,
  CampaignFormPayloadSchema,
  CatalogComposerPayloadSchema,
  CatalogPublishActionSchema,
  type CatalogNotifyRecipientFilter,
  type CatalogComposerFilterState,
  type CatalogComposerPricingStrategy,
  type CatalogComposerTag,
} from '@/lib/zod';

type DbClient = NonNullable<typeof supabaseAdmin>;

type CatalogStatus = RawCampaignStatus;

type ScopeType = 'cohort' | 'buyer' | 'geography' | 'all';
type ComposerScopeType = 'cohort' | 'buyer' | 'all';

type CatalogDraftSnapshot = {
  name: string;
  valid_from: string;
  valid_to: string | null;
  scope_type: ComposerScopeType;
  cohort_id: string | null;
  buyer_ids: string[];
  message: string | null;
  price_source: 'price_list' | 'manual';
  price_list_id: string | null;
  pricing_strategy?: CatalogComposerPricingStrategy;
  filters: CatalogComposerFilterState;
  tag_overrides: Record<string, CatalogComposerTag | null>;
  items: Array<{
    tenant_product_id: string;
    display_order: number;
    price_override?: number | null;
  }>;
};

const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('extend_validity'),
    valid_until: z.string().datetime(),
  }),
  CatalogPublishActionSchema,
  CatalogPublishUpdatesActionSchema,
  CatalogNotifyBuyersActionSchema,
  z.object({
    action: z.literal('ensure_share_link'),
  }),
  z.object({
    action: z.literal('add_product'),
    tenant_product_id: z.string().uuid(),
    price_override: z.number().nonnegative().nullable().optional(),
  }),
  z.object({
    action: z.literal('remove_product'),
    tenant_product_id: z.string().uuid(),
  }),
]);

function defaultCatalogFilters(): CatalogComposerFilterState {
  return {
    brand_names: [],
    category_names: [],
    availability: 'show_everything' as const,
  };
}

function buildCatalogScopeValue(input: {
  scopeType: ComposerScopeType;
  cohortId?: string | null;
  buyerIds?: string[];
  filters: CatalogComposerFilterState;
  tagOverrides?: Record<string, CatalogComposerTag | null>;
  priceSource?: 'price_list' | 'manual';
  priceListId?: string | null;
  pricingStrategy?: CatalogComposerPricingStrategy;
  draft?: CatalogDraftSnapshot | null;
}) {
  return {
    ...(input.scopeType === 'cohort' && input.cohortId ? { cohort_id: input.cohortId } : {}),
    ...(input.scopeType === 'buyer' && input.buyerIds && input.buyerIds.length > 0 ? { buyer_ids: input.buyerIds } : {}),
    composer: {
      filters: input.filters,
      tag_overrides: input.tagOverrides ?? {},
      price_source: input.priceSource ?? 'manual',
      price_list_id: input.priceListId ?? null,
      pricing_strategy: input.pricingStrategy,
    },
    ...(input.draft ? { composer_draft: input.draft } : {}),
  };
}

function readSimpleFormDescription(scopeValue: Record<string, unknown> | null): string {
  const value = (scopeValue ?? {}) as { simple_form?: { description?: string | null } | null };
  return value.simple_form?.description ?? '';
}

function generateShareToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

function buildBuyerCatalogUrl(origin: string, shareToken: string) {
  return `${origin}/buy/catalog?share_token=${shareToken}`;
}

function buildCatalogDraftSnapshot(payload: z.infer<typeof CatalogComposerPayloadSchema>): CatalogDraftSnapshot {
  return {
    name: payload.name,
    valid_from: payload.valid_from.toISOString(),
    valid_to: payload.valid_to ? payload.valid_to.toISOString() : null,
    scope_type: payload.scope_type,
    cohort_id: payload.scope_type === 'cohort' ? (payload.cohort_id ?? null) : null,
    buyer_ids: payload.scope_type === 'buyer' ? payload.buyer_ids : [],
    message: payload.message?.trim() || null,
    price_source: payload.price_source,
    price_list_id: payload.price_source === 'price_list' ? (payload.price_list_id ?? null) : null,
    pricing_strategy: payload.pricing_strategy,
    filters: payload.filters,
    tag_overrides: payload.tag_overrides,
    items: payload.items,
  };
}

function readComposerDraft(scopeValue: Record<string, unknown> | null): CatalogDraftSnapshot | null {
  const value = (scopeValue ?? {}) as { composer_draft?: CatalogDraftSnapshot | null };
  return value.composer_draft ?? null;
}

function resolveDetailWorkflowStatus(input: {
  rawStatus: CatalogStatus;
  validFrom: string | null;
  validTo: string | null;
  scopeValue: Record<string, unknown> | null;
}) {
  return resolveCampaignWorkflowStatus({
    rawStatus: input.rawStatus,
    validFrom: input.validFrom,
    validTo: input.validTo,
    hasUnpublishedChanges: Boolean(readComposerDraft(input.scopeValue)),
  });
}

function buildScopeValueFromDraft(
  draft: CatalogDraftSnapshot,
) {
  return buildCatalogScopeValue({
    scopeType: draft.scope_type,
    cohortId: draft.cohort_id,
    buyerIds: draft.buyer_ids,
    filters: draft.filters,
    tagOverrides: draft.tag_overrides,
    priceSource: draft.price_source,
    priceListId: draft.price_list_id,
    pricingStrategy: draft.pricing_strategy,
    draft: null,
  });
}

async function ensureTenantProducts(
  db: DbClient,
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

async function ensureTenantBuyers(db: DbClient, tenantId: string, buyerIds: string[]) {
  if (buyerIds.length === 0) return new Set<string>();

  const { data, error } = await db
    .schema('app')
    .from('buyers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('id', buyerIds)
    .is('deleted_at', null);

  if (error) throw new Error('Failed to validate selected buyers');
  return new Set<string>(((data ?? []) as Array<{ id: string }>).map((row) => row.id));
}

async function ensureTenantPriceList(db: DbClient, tenantId: string, priceListId: string | null | undefined) {
  if (!priceListId) return true;

  const { data, error } = await db
    .schema('app')
    .from('price_lists')
    .select('id')
    .eq('id', priceListId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error('Failed to validate price list');
  return Boolean(data);
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(date: string | null): string {
  if (!date) return 'No end date';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dayKey(input: string): string {
  return new Date(input).toISOString().slice(0, 10);
}

function canonicalOrderDay(order: { order_date?: string | null; placed_at?: string | null; created_at?: string | null }) {
  if (order.order_date) return order.order_date;
  if (order.placed_at) return dayKey(order.placed_at);
  if (order.created_at) return dayKey(order.created_at);
  return null;
}

function canonicalEstimateDay(estimate: { estimate_date?: string | null; created_at?: string | null }) {
  if (estimate.estimate_date) return estimate.estimate_date;
  if (estimate.created_at) return dayKey(estimate.created_at);
  return null;
}

function extractBuyerCity(geography: unknown): string {
  if (!geography || typeof geography !== 'object') return 'Unknown';
  const city = (geography as { city?: unknown }).city;
  return typeof city === 'string' && city.trim().length > 0 ? city : 'Unknown';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const includePerformance = request.nextUrl.searchParams.get('include_performance') !== 'false';
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as DbClient;

  const { data: globalCatalog, error: globalCatalogError } = await db
    .schema('app')
    .from('campaigns')
    .select('id, tenant_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (globalCatalogError) return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
  if (!globalCatalog) return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });
  if (globalCatalog.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [detailV2Res, catalogRes, itemsRes, ordersRes, estimatesRes, viewsRes, composerPayload] = await Promise.all([
    includePerformance
      ? db.schema('app').rpc('get_seller_campaign_detail_v2', {
          p_tenant_id: claims.tenant_id,
          p_campaign_id: id,
        })
      : Promise.resolve({ data: null, error: null }),
    db
      .schema('app')
      .from('campaigns')
      .select('id, tenant_id, name, scope_type, scope_value, valid_from, valid_to, status, share_token, message, hero_image_url, created_by, created_at, buyer_target_mode, buyer_filter_rules, product_membership_mode, dynamic_rules')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .single(),
    // No deleted_at filter: point-in-time SKU attribution below needs every historical
    // membership window, not just currently-active items.
    db
      .schema('app')
      .from('campaign_items')
      .select('id, tenant_product_id, price_override, display_order, created_at, valid_from, deleted_at')
      .eq('campaign_id', id)
      .order('display_order', { ascending: true }),
    db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, total_amount, placed_at, order_date, status, created_at')
      .eq('tenant_id', claims.tenant_id)
      .eq('campaign_id', id)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('estimates')
      .select('id, buyer_id, total_amount, status, converted_to_order_id, estimate_date, created_at')
      .eq('tenant_id', claims.tenant_id)
      .eq('campaign_id', id)
      .is('deleted_at', null),
    // Point-in-time audience filter (requirement 7): a view only counts toward opens if the
    // buyer was actually in the campaign's audience at the moment they viewed it, not just
    // currently. See app.filter_campaign_views_by_audience_at_view_time.
    db.schema('app').rpc('filter_campaign_views_by_audience_at_view_time', { p_campaign_id: id }),
    getCatalogComposerPayload(db, claims.tenant_id, claims.role),
  ]);

  if (catalogRes.error) return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });
  if (detailV2Res.error || itemsRes.error || ordersRes.error || estimatesRes.error || viewsRes.error) {
    return NextResponse.json({ error: 'Failed to load catalog detail' }, { status: 500 });
  }
  const detailV2 = detailV2Res.data as any;

  const catalog = catalogRes.data as {
    id: string;
    tenant_id: string;
    name: string;
    scope_type: ScopeType;
    scope_value: Record<string, unknown> | null;
    valid_from: string;
    valid_to: string | null;
    status: CatalogStatus;
    share_token: string | null;
    message: string | null;
    hero_image_url: string | null;
    created_by: string | null;
    created_at: string;
    buyer_target_mode: string | null;
    buyer_filter_rules: Record<string, unknown> | null;
    product_membership_mode: string | null;
    dynamic_rules: Record<string, unknown> | null;
  };

  const allCampaignItemRows = (itemsRes.data ?? []) as Array<{
    id: string;
    tenant_product_id: string;
    price_override: number | null;
    display_order: number | null;
    created_at: string;
    valid_from: string;
    deleted_at: string | null;
  }>;
  // Display list stays current-membership-only, matching prior behavior.
  const catalogItems = allCampaignItemRows.filter((item) => item.deleted_at === null);
  const campaignItemWindowsByProduct = new Map<string, CampaignItemMembershipWindow[]>();
  for (const item of allCampaignItemRows) {
    const windows = campaignItemWindowsByProduct.get(item.tenant_product_id) ?? [];
    windows.push({ valid_from: item.valid_from, deleted_at: item.deleted_at });
    campaignItemWindowsByProduct.set(item.tenant_product_id, windows);
  }

  const orders = (ordersRes.data ?? []) as CampaignOrderRow[];

  const estimates = (estimatesRes.data ?? []) as CampaignEstimateRow[];

  const campaignViewRows = (viewsRes.data ?? []) as CampaignViewRow[];

  const scopeValue = (catalog.scope_value ?? {}) as { cohort_id?: string; buyer_id?: string; buyer_ids?: string[] };
  const composerScopeValue = (catalog.scope_value ?? {}) as {
    cohort_id?: string;
    buyer_ids?: string[];
    composer?: {
      filters?: ReturnType<typeof defaultCatalogFilters>;
      tag_overrides?: Record<string, CatalogComposerTag | null>;
      price_source?: 'price_list' | 'manual';
      price_list_id?: string | null;
      pricing_strategy?: CatalogComposerPricingStrategy;
    };
    composer_draft?: CatalogDraftSnapshot;
  };
  const filters = composerScopeValue.composer?.filters ?? defaultCatalogFilters();
  const tagOverrides = composerScopeValue.composer?.tag_overrides ?? {};
  const composerDraft = composerScopeValue.composer_draft ?? null;

  let scopedBuyerIds: string[] = [];
  let selectedCohortId: string | null = null;
  let selectedCohortName = 'All buyers';

  if (catalog.scope_type === 'cohort' && scopeValue.cohort_id) {
    selectedCohortId = scopeValue.cohort_id;
    const [membersRes, cohortRes] = await Promise.all([
      db.schema('app').from('cohort_members_active').select('buyer_id').eq('cohort_id', scopeValue.cohort_id),
      db.schema('app').from('cohorts').select('name').eq('id', scopeValue.cohort_id).maybeSingle(),
    ]);

    if (membersRes.error) return NextResponse.json({ error: 'Failed to load cohort members' }, { status: 500 });
    scopedBuyerIds = ((membersRes.data ?? []) as Array<{ buyer_id: string }>).map((row) => row.buyer_id);
    if (!cohortRes.error && cohortRes.data?.name) selectedCohortName = cohortRes.data.name;
  } else if (catalog.scope_type === 'buyer' && scopeValue.buyer_id) {
    scopedBuyerIds = [scopeValue.buyer_id];
    const buyerRes = await db.schema('app').from('buyers').select('business_name').eq('id', scopeValue.buyer_id).maybeSingle();
    if (!buyerRes.error && buyerRes.data?.business_name) selectedCohortName = buyerRes.data.business_name;
  } else if (catalog.scope_type === 'buyer' && scopeValue.buyer_ids && scopeValue.buyer_ids.length > 0) {
    scopedBuyerIds = scopeValue.buyer_ids;
    selectedCohortName = 'Selected buyers';
  } else {
    const allBuyersRes = await db
      .schema('app')
      .from('buyers')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (allBuyersRes.error) return NextResponse.json({ error: 'Failed to load buyers' }, { status: 500 });
    scopedBuyerIds = ((allBuyersRes.data ?? []) as Array<{ id: string }>).map((row) => row.id);
    selectedCohortName = catalog.scope_type === 'all' ? 'All buyers' : 'Targeted buyers';
  }

  const cohortMemberIds = Array.from(new Set(scopedBuyerIds));
  const buyersRes = cohortMemberIds.length
    ? await db
        .schema('app')
        .from('buyers')
        .select('id, business_name, geography, tier')
        .in('id', cohortMemberIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  if (buyersRes.error) return NextResponse.json({ error: 'Failed to load buyers' }, { status: 500 });

  const buyersById = new Map(
    ((buyersRes.data ?? []) as Array<{ id: string; business_name: string; geography: unknown; tier: string | null }>).map((buyer) => [
      buyer.id,
      buyer,
    ]),
  );

  // Broader than the current-membership catalogItems list: includes products that were part
  // of this campaign at some point in the past, so their historical line items are still
  // fetched and can be point-in-time attributed below.
  const tenantProductIds = Array.from(campaignItemWindowsByProduct.keys());
  const orderIds = orders.map((order) => order.id);
  const eligibleOrders = orders.filter(isEligibleCampaignOrder);
  const eligibleEstimates = estimates.filter(isEligibleCampaignEstimate);
  const validOrderIds = new Set(eligibleOrders.map((order) => order.id));
  const validEstimateIds = new Set(eligibleEstimates.map((estimate) => estimate.id));
  const productMetaById = new Map(composerPayload.products.map((product) => [product.id, product]));

  const [orderItemsRes, estimateItemsRes, createFlags] = await Promise.all([
    orderIds.length && tenantProductIds.length
      ? db
          .schema('app')
          .from('order_items')
          .select('order_id, tenant_product_id, qty, line_total, unit_price')
          .in('order_id', orderIds)
          .in('tenant_product_id', tenantProductIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    eligibleEstimates.length && tenantProductIds.length
      ? db
          .schema('app')
          .from('estimate_items')
          .select('estimate_id, tenant_product_id, qty, line_total, unit_price')
          .in('estimate_id', Array.from(validEstimateIds))
          .in('tenant_product_id', tenantProductIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    getInAppCreateFlags(claims.tenant_id),
  ]);

  if (orderItemsRes.error || estimateItemsRes.error) {
    return NextResponse.json({ error: 'Failed to load line items' }, { status: 500 });
  }

  // Point-in-time attribution: a line item only counts toward this campaign if its product
  // was actually a campaign member on the date the order/estimate was placed -- not just
  // currently. Matches recordConversion's own date fallback (placed_at ?? created_at for
  // orders; created_at for estimates) so the gating date lines up with the GMV timestamp.
  const orderDateByParentId = new Map(orders.map((order) => [order.id, order.placed_at ?? order.created_at]));
  const estimateDateByParentId = new Map(estimates.map((estimate) => [estimate.id, estimate.created_at]));

  const rawOrderItems = ((orderItemsRes.data ?? []) as Array<{
    order_id: string;
    tenant_product_id: string;
    qty: number | null;
    line_total: number | null;
    unit_price: number | null;
  }>).map((item) => ({ ...item, parent_id: item.order_id }));
  const rawEstimateItems = ((estimateItemsRes.data ?? []) as Array<{
    estimate_id: string;
    tenant_product_id: string;
    qty: number | null;
    line_total: number | null;
    unit_price: number | null;
  }>).map((item) => ({ ...item, parent_id: item.estimate_id }));

  const attributedOrderItems = filterLineItemsByMembershipWindow(rawOrderItems, orderDateByParentId, campaignItemWindowsByProduct);
  const attributedEstimateItems = filterLineItemsByMembershipWindow(rawEstimateItems, estimateDateByParentId, campaignItemWindowsByProduct);

  const orderItemsByParent = groupLineItemsByParent(attributedOrderItems);
  const estimateItemsByParent = groupLineItemsByParent(attributedEstimateItems);

  const channelOptions = {
    includeOrders: createFlags.create_sales_orders,
    includeEstimates: createFlags.create_enquiries,
  };
  const channelEligibleOrders = channelOptions.includeOrders ? eligibleOrders : [];
  const channelEligibleEstimates = channelOptions.includeEstimates ? eligibleEstimates : [];
  const channelValidOrderIds = new Set(channelEligibleOrders.map((order) => order.id));
  const channelValidEstimateIds = new Set(channelEligibleEstimates.map((estimate) => estimate.id));

  const viewMetrics = computeCampaignViewMetrics(campaignViewRows);
  const viewMetricsByCampaign = aggregateCampaignViewsByCampaign(campaignViewRows);
  const conversionMetrics = computeCampaignAttributedMetrics(
    orders,
    estimates,
    orderItemsByParent,
    estimateItemsByParent,
    channelOptions,
  );
  const { uniqueViewers, totalViews, lastOpenedAtByBuyer } = viewMetrics;
  const {
    conversionCount,
    orderCount,
    estimateCount,
    gmv,
    convertingBuyerIds,
    conversionsByBuyer,
    spendByBuyer,
    lastConversionAtByBuyer,
    attributedGmvByOrderId,
    attributedGmvByEstimateId,
  } = conversionMetrics;

  const skuMetricsByProduct = rollupSkuMetrics(
    attributedOrderItems,
    attributedEstimateItems,
    channelValidOrderIds,
    channelValidEstimateIds,
  );

  const dailyRollup = new Map<string, { revenue: number; conversions: number }>();

  for (const order of channelEligibleOrders) {
    const date = canonicalOrderDay(order);
    if (!date) continue;
    const amount = attributedGmvByOrderId.get(order.id) ?? 0;
    if (amount <= 0) continue;
    const current = dailyRollup.get(date) ?? { revenue: 0, conversions: 0 };
    current.revenue += amount;
    current.conversions += 1;
    dailyRollup.set(date, current);
  }

  for (const estimate of channelEligibleEstimates) {
    const date = canonicalEstimateDay(estimate);
    if (!date) continue;
    const amount = attributedGmvByEstimateId.get(estimate.id) ?? 0;
    if (amount <= 0) continue;
    const current = dailyRollup.get(date) ?? { revenue: 0, conversions: 0 };
    current.revenue += amount;
    current.conversions += 1;
    dailyRollup.set(date, current);
  }

  const previousCatalogRes = await db
    .schema('app')
    .from('campaigns')
    .select('id, valid_from')
    .eq('tenant_id', claims.tenant_id)
    .neq('id', id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .lt('valid_from', catalog.valid_from)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  let previousGmv = 0;
  if (!previousCatalogRes.error && previousCatalogRes.data?.id) {
    const prevCampaignId = previousCatalogRes.data.id;
    const [prevItemsRes, prevOrdersRes, prevEstimatesRes] = await Promise.all([
      // No deleted_at filter here either -- same point-in-time reasoning as the current period.
      db
        .schema('app')
        .from('campaign_items')
        .select('tenant_product_id, valid_from, deleted_at')
        .eq('campaign_id', prevCampaignId),
      db
        .schema('app')
        .from('orders')
        .select('id, buyer_id, total_amount, placed_at, order_date, status, created_at')
        .eq('tenant_id', claims.tenant_id)
        .eq('campaign_id', prevCampaignId)
        .is('deleted_at', null),
      db
        .schema('app')
        .from('estimates')
        .select('id, buyer_id, total_amount, status, converted_to_order_id, estimate_date, created_at')
        .eq('tenant_id', claims.tenant_id)
        .eq('campaign_id', prevCampaignId)
        .is('deleted_at', null),
    ]);

    const prevItemRows = (prevItemsRes.data ?? []) as Array<{
      tenant_product_id: string;
      valid_from: string;
      deleted_at: string | null;
    }>;
    const prevWindowsByProduct = new Map<string, CampaignItemMembershipWindow[]>();
    for (const row of prevItemRows) {
      const windows = prevWindowsByProduct.get(row.tenant_product_id) ?? [];
      windows.push({ valid_from: row.valid_from, deleted_at: row.deleted_at });
      prevWindowsByProduct.set(row.tenant_product_id, windows);
    }
    const prevProductIds = Array.from(prevWindowsByProduct.keys());
    const prevOrders = ((prevOrdersRes.data ?? []) as CampaignOrderRow[]) ?? [];
    const prevEstimates = ((prevEstimatesRes.data ?? []) as CampaignEstimateRow[]) ?? [];
    const prevEligibleOrders = prevOrders.filter(isEligibleCampaignOrder);
    const prevEligibleEstimates = prevEstimates.filter(isEligibleCampaignEstimate);
    const prevOrderIds = prevOrders.map((order) => order.id);

    const [prevOrderItemsRes, prevEstimateItemsRes] = await Promise.all([
      prevOrderIds.length && prevProductIds.length
        ? db
            .schema('app')
            .from('order_items')
            .select('order_id, tenant_product_id, qty, line_total, unit_price')
            .in('order_id', prevOrderIds)
            .in('tenant_product_id', prevProductIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      prevEligibleEstimates.length && prevProductIds.length
        ? db
            .schema('app')
            .from('estimate_items')
            .select('estimate_id, tenant_product_id, qty, line_total, unit_price')
            .in('estimate_id', prevEligibleEstimates.map((estimate) => estimate.id))
            .in('tenant_product_id', prevProductIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (!prevOrderItemsRes.error && !prevEstimateItemsRes.error) {
      const prevOrderDateByParentId = new Map(prevOrders.map((order) => [order.id, order.placed_at ?? order.created_at]));
      const prevEstimateDateByParentId = new Map(prevEstimates.map((estimate) => [estimate.id, estimate.created_at]));
      const prevRawOrderItems = ((prevOrderItemsRes.data ?? []) as Array<{
        order_id: string;
        tenant_product_id: string;
        qty: number | null;
        line_total: number | null;
        unit_price: number | null;
      }>).map((item) => ({ ...item, parent_id: item.order_id }));
      const prevRawEstimateItems = ((prevEstimateItemsRes.data ?? []) as Array<{
        estimate_id: string;
        tenant_product_id: string;
        qty: number | null;
        line_total: number | null;
        unit_price: number | null;
      }>).map((item) => ({ ...item, parent_id: item.estimate_id }));

      const prevMetrics = computeCampaignAttributedMetrics(
        prevOrders,
        prevEstimates,
        groupLineItemsByParent(
          filterLineItemsByMembershipWindow(prevRawOrderItems, prevOrderDateByParentId, prevWindowsByProduct),
        ),
        groupLineItemsByParent(
          filterLineItemsByMembershipWindow(prevRawEstimateItems, prevEstimateDateByParentId, prevWindowsByProduct),
        ),
        channelOptions,
      );
      previousGmv = prevMetrics.gmv;
    }
  }

  const growthPct = previousGmv > 0 ? Number((((gmv - previousGmv) / previousGmv) * 100).toFixed(1)) : gmv > 0 ? 100 : 0;
  const demandCustomers = convertingBuyerIds.size;
  const conversionRate = uniqueViewers > 0 ? Number(((demandCustomers / uniqueViewers) * 100).toFixed(1)) : 0;
  const abandoners = Math.max(0, uniqueViewers - convertingBuyerIds.size);
  const aov = conversionCount > 0 ? gmv / conversionCount : 0;
  const today = Date.now();
  const daysLeft = catalog.valid_to ? Math.max(0, Math.ceil((new Date(catalog.valid_to).getTime() - today) / (1000 * 60 * 60 * 24))) : 0;

  const products = catalogItems.map((item, index) => {
    const composerProduct = productMetaById.get(item.tenant_product_id);
    const catalogMetrics = skuMetricsByProduct.get(item.tenant_product_id) ?? { units: 0, gmv: 0 };
    return {
      tenant_product_id: item.tenant_product_id,
      product_name: composerProduct?.display_name ?? 'Unknown product',
      internal_sku: composerProduct?.internal_sku ?? item.tenant_product_id,
      brand_name: composerProduct?.brand_name ?? 'Unknown brand',
      catalog_gmv: catalogMetrics.gmv,
      catalog_units_sold: catalogMetrics.units,
      stock_label: composerProduct?.stock_label ?? 'Out',
      stock_tone: composerProduct?.stock_tone ?? 'neutral',
      mrp: composerProduct?.mrp ?? null,
      base_selling_price: composerProduct?.base_selling_price ?? null,
      units_mtd: composerProduct?.units_mtd ?? 0,
      days_cover: composerProduct?.days_cover ?? null,
      tag: tagOverrides[item.tenant_product_id] ?? composerProduct?.tag ?? null,
      override_price: item.price_override != null ? Number(item.price_override) : null,
      catalog_order: item.display_order ?? index,
    };
  });

  const composition = products.map((product) => ({
    tenant_product_id: product.tenant_product_id,
    product: product.product_name,
    brand: product.brand_name,
    mrp: Number(product.mrp ?? 0),
    catalog_price: Number(product.base_selling_price ?? 0),
    override_price: product.override_price,
    stock_status: product.stock_tone === 'warning' ? 'Low stock' : product.stock_tone === 'success' ? 'In stock' : 'Out of stock',
  }));

  const brandsCovered = new Set(products.map((item) => item.brand_name)).size;

  const performanceDaily = Array.from(dailyRollup.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({
      date,
      revenue: value.revenue,
      conversion_rate: uniqueViewers > 0 ? Number(((value.conversions / uniqueViewers) * 100).toFixed(2)) : 0,
    }));

  const cumulativeOrders = Array.from(dailyRollup.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .reduce<Array<{ date: string; orders_cumulative: number; gmv_cumulative: number }>>((acc, [date, value]) => {
      const previous = acc[acc.length - 1] ?? { orders_cumulative: 0, gmv_cumulative: 0 };
      acc.push({
        date,
        orders_cumulative: previous.orders_cumulative + value.conversions,
        gmv_cumulative: previous.gmv_cumulative + value.revenue,
      });
      return acc;
    }, []);

  const safeCumulativeOrders =
    cumulativeOrders.length > 0
      ? cumulativeOrders
      : [{ date: dayKey(catalog.valid_from), orders_cumulative: 0, gmv_cumulative: 0 }];

  const topSkus = products
    .map((product) => {
      const metrics = skuMetricsByProduct.get(product.tenant_product_id) ?? { units: 0, gmv: 0 };
      return {
        tenant_product_id: product.tenant_product_id,
        product_name: product.product_name,
        internal_sku: product.internal_sku,
        gmv: metrics.gmv,
        units: metrics.units,
        catalog_order: product.catalog_order,
      };
    })
    .sort((a, b) => {
      if (b.gmv !== a.gmv) return b.gmv - a.gmv;
      if (b.units !== a.units) return b.units - a.units;
      return a.catalog_order - b.catalog_order;
    })
    .map(({ catalog_order, ...row }) => row);

  const buyers = cohortMemberIds
    .map((buyerId) => {
      const buyer = buyersById.get(buyerId);
      const buyerConversionCount = conversionsByBuyer.get(buyerId) ?? 0;
      const spend = spendByBuyer.get(buyerId) ?? 0;
      const lastOpenedAt = lastOpenedAtByBuyer.get(buyerId) ?? null;
      const lastConversionAt = lastConversionAtByBuyer.get(buyerId) ?? null;

      return {
        buyer_id: buyerId,
        buyer_name: buyer?.business_name ?? 'Unknown buyer',
        city: extractBuyerCity(buyer?.geography),
        cohort_label: selectedCohortName,
        opened_status: getCampaignBuyerOpenedStatus(buyerConversionCount, lastOpenedAt),
        spend,
        orders: buyerConversionCount,
        last_opened_at: lastOpenedAt,
        last_order_at: lastConversionAt,
      };
    })
    .sort((a, b) => {
      if (b.spend !== a.spend) return b.spend - a.spend;
      if (b.orders !== a.orders) return b.orders - a.orders;
      return a.buyer_name.localeCompare(b.buyer_name);
    });

  const publishedBy = catalog.created_by ? `User ${catalog.created_by.slice(0, 8)}` : 'System';
  const workflowStatus = resolveCampaignWorkflowStatus({
    rawStatus: catalog.status,
    validFrom: catalog.valid_from,
    validTo: catalog.valid_to,
    hasUnpublishedChanges: Boolean(composerDraft),
  });
  const currentCatalogViewMetrics = viewMetricsByCampaign.get(catalog.id) ?? viewMetrics;

  return NextResponse.json({
    header: {
      id: catalog.id,
      name: catalog.name,
      status_label: workflowStatus.label,
      status_tone: workflowStatus.tone,
      initials: getInitials(catalog.name),
      products_count: products.length,
      brands_covered: brandsCovered,
      cohort_name: selectedCohortName,
      valid_from_label: formatDate(catalog.valid_from),
      valid_until_label: formatDate(catalog.valid_to),
      valid_until_iso: catalog.valid_to,
      hero_image_url: catalog.hero_image_url,
      published_by: publishedBy,
      share_token: catalog.share_token,
      share_url: catalog.share_token ? buildBuyerCatalogUrl(request.nextUrl.origin, catalog.share_token) : null,
      scope_type: catalog.scope_type,
      status_value: workflowStatus.value,
      status_raw_value: catalog.status,
      selected_cohort: {
        id: selectedCohortId,
        name: selectedCohortName,
        member_count: cohortMemberIds.length,
        scope_type: catalog.scope_type,
        display_label: selectedCohortName,
      },
    },
    meta_strip_4: {
      gmv,
      orders: conversionCount,
      conversions: conversionCount,
      demand_customers: demandCustomers,
      order_count: orderCount,
      estimate_count: estimateCount,
      conversion_rate: conversionRate,
      unique_viewers: uniqueViewers,
      cohort_members: cohortMemberIds.length,
      days_left: daysLeft,
      valid_until_label: formatDate(catalog.valid_to),
    },
    composition,
    products_summary: {
      filters,
      included_count: products.length,
      brands_covered: brandsCovered,
      in_stock_count: products.filter((product) => product.stock_tone === 'success').length,
      tag_overrides_count: Object.values(tagOverrides).filter(Boolean).length,
    },
    products,
    performance: {
      channels: {
        estimates_enabled: createFlags.create_enquiries,
        orders_enabled: createFlags.create_sales_orders,
      },
      summary: {
        orders: conversionCount,
        conversions: conversionCount,
        demand_customers: demandCustomers,
        order_count: orderCount,
        estimate_count: estimateCount,
        gmv,
        aov,
        views: totalViews,
        unique_viewers: currentCatalogViewMetrics.uniqueViewers,
        conversion_rate: conversionRate,
        abandoners,
        valid_until_label: formatDate(catalog.valid_to),
        published_at_label: formatDate(catalog.valid_from),
      },
      funnel: {
        unique_viewers: uniqueViewers,
        conversions: conversionCount,
        demand_customers: demandCustomers,
        orders: orderCount,
        estimates: estimateCount,
        gmv,
      },
      daily: performanceDaily,
      cumulative_orders: safeCumulativeOrders,
      top_skus: topSkus,
      per_buyer_activity: buyers.map((buyer) => ({
        buyer_id: buyer.buyer_id,
        buyer_name: buyer.buyer_name,
        city: buyer.city,
        opened_status: buyer.opened_status,
        orders: buyer.orders,
        gmv: buyer.spend,
        last_opened_at: buyer.last_opened_at,
        last_order_at: buyer.last_order_at,
      })),
    },
    performance_cards: includePerformance ? (detailV2?.performance_cards ?? []) : [],
    detail_v2: includePerformance ? detailV2 : null,
    buyers: buyers.slice(0, 50),
    permissions: {
      can_extend_validity: claims.role === 'seller_admin',
      can_edit_composition: claims.role === 'seller_admin',
    },
    composer: {
      name: composerDraft?.name ?? catalog.name,
      description: readSimpleFormDescription((catalog.scope_value ?? {}) as Record<string, unknown>),
      status: workflowStatus.value,
      live_status: resolveCampaignWorkflowStatus({
        rawStatus: catalog.status,
        validFrom: catalog.valid_from,
        validTo: catalog.valid_to,
        hasUnpublishedChanges: false,
      }).value,
      has_unpublished_changes: Boolean(composerDraft),
      valid_from: composerDraft?.valid_from ?? catalog.valid_from,
      valid_to: composerDraft?.valid_to ?? catalog.valid_to,
      message: composerDraft?.message ?? catalog.message ?? '',
      price_source: composerDraft?.price_source ?? composerScopeValue.composer?.price_source ?? 'manual',
      price_list_id: composerDraft?.price_list_id ?? composerScopeValue.composer?.price_list_id ?? null,
      pricing_strategy: composerDraft?.pricing_strategy ?? composerScopeValue.composer?.pricing_strategy,
      scope_type: composerDraft?.scope_type ?? (catalog.scope_type === 'all' ? 'all' : catalog.scope_type === 'buyer' ? 'buyer' : 'cohort'),
      cohort_id: composerDraft?.cohort_id ?? composerScopeValue.cohort_id ?? null,
      buyer_ids: composerDraft?.buyer_ids ?? composerScopeValue.buyer_ids ?? (scopeValue.buyer_id ? [scopeValue.buyer_id] : []),
      filters: composerDraft?.filters ?? filters,
      buyer_target_mode: catalog.buyer_target_mode ?? (catalog.scope_type === 'cohort' ? 'customer_group' : 'manual'),
      buyer_rules: catalog.buyer_filter_rules ?? {},
      product_membership_mode: catalog.product_membership_mode ?? 'manual',
      product_rules: catalog.dynamic_rules ?? { brand_names: [], category_names: [] },
      tag_overrides: composerDraft?.tag_overrides ?? tagOverrides,
      items: (composerDraft?.items ?? catalogItems.map((item) => ({
        tenant_product_id: item.tenant_product_id,
        display_order: item.display_order ?? 0,
        price_override: item.price_override ?? null,
      }))),
    },
  }, { headers: SELLER_CACHE_PERSONAL });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const rawBody = await request.json().catch(() => null);
  const actionParsed = PatchSchema.safeParse(rawBody);
  const simpleParsed = actionParsed.success ? null : CampaignFormPayloadSchema.safeParse(rawBody);
  const composerParsed = actionParsed.success || simpleParsed?.success ? null : CatalogComposerPayloadSchema.safeParse(rawBody);
  if (!actionParsed.success && !simpleParsed?.success && !composerParsed?.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const db = supabaseAdmin as DbClient;

  const { data: globalCatalog, error: globalCatalogError } = await db
    .schema('app')
    .from('campaigns')
    .select('id, tenant_id, name, status, share_token, scope_type, scope_value, valid_from, valid_to, message, hero_image_url')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (globalCatalogError) return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
  if (!globalCatalog) return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });
  if (globalCatalog.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const globalWorkflowStatus = resolveDetailWorkflowStatus({
    rawStatus: globalCatalog.status as CatalogStatus,
    validFrom: globalCatalog.valid_from as string | null,
    validTo: globalCatalog.valid_to as string | null,
    scopeValue: (globalCatalog.scope_value ?? {}) as Record<string, unknown> | null,
  });
  const globalComposerDraft = readComposerDraft((globalCatalog.scope_value ?? {}) as Record<string, unknown>);

  if (actionParsed.success && actionParsed.data.action === 'extend_validity') {
    if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await db
      .schema('app')
      .from('campaigns')
      .update({ valid_to: actionParsed.data.valid_until, updated_by: claims.sub })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null);

    if (error) return NextResponse.json({ error: 'Failed to extend validity' }, { status: 500 });
    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({ ok: true });
  }

  if (actionParsed.success && actionParsed.data.action === 'publish_catalog') {
    if (claims.role !== 'seller_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (globalCatalog.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft catalogs can be published' }, { status: 400 });
    }

    const publishInput = actionParsed.data;
    const scopeValue = (globalCatalog.scope_value ?? {}) as Record<string, unknown>;

    if (publishInput.notify_whatsapp) {
      const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
      if (!flagEnabled) {
        return NextResponse.json({ error: 'WhatsApp broadcast feature is not enabled' }, { status: 403 });
      }

      const preflight = await runCampaignPublishPreflight(db, {
        tenantId: claims.tenant_id,
        scopeType: globalCatalog.scope_type as ScopeType,
        scopeValue,
        notifyWhatsapp: true,
        buyerNote: publishInput.buyer_note ?? '',
      });

      if (!preflight.can_notify) {
        return NextResponse.json(
          { error: preflight.blockers[0] ?? 'WhatsApp notify preflight failed', blockers: preflight.blockers },
          { status: 400 },
        );
      }

      if (publishInput.notify_scheduled_for && new Date(publishInput.notify_scheduled_for).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
      }
    }

    const shareToken = globalCatalog.share_token ?? generateShareToken();
    const buyerNote = publishInput.buyer_note?.trim();

    const { error } = await db
      .schema('app')
      .from('campaigns')
      .update({
        status: 'published',
        share_token: shareToken,
        ...(buyerNote !== undefined ? { message: buyerNote || null } : {}),
        ...(publishInput.hero_image_url ? { hero_image_url: publishInput.hero_image_url } : {}),
        updated_by: claims.sub,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null);

    if (error) return NextResponse.json({ error: 'Failed to publish catalog' }, { status: 500 });

    let whatsappNotify: { broadcast_id: string; recipient_count: number; scheduled: boolean } | null = null;

    if (publishInput.notify_whatsapp) {
      const { data: publishedCampaign } = await db
        .schema('app')
        .from('campaigns')
        .select('id, name, scope_type, scope_value, hero_image_url, message')
        .eq('id', id)
        .eq('tenant_id', claims.tenant_id)
        .maybeSingle();

      if (publishedCampaign) {
        try {
          whatsappNotify = await queueCampaignPublishNotify(db, {
            tenantId: claims.tenant_id,
            actorId: claims.sub ?? claims.tenant_id,
            campaignId: id,
            campaignName: publishedCampaign.name as string,
            scopeType: publishedCampaign.scope_type as ScopeType,
            scopeValue: (publishedCampaign.scope_value ?? {}) as Record<string, unknown>,
            buyerNote: publishedCampaign.message as string | null,
            scheduledFor: publishInput.notify_scheduled_for ?? null,
            heroImageUrl: publishedCampaign.hero_image_url as string | null,
          });
        } catch (notifyError) {
          console.error('[publish_catalog] WhatsApp notify failed after publish:', notifyError);
          return NextResponse.json(
            {
              error: notifyError instanceof Error ? notifyError.message : 'Campaign published but WhatsApp notify failed',
              ok: true,
              share_link: {
                share_token: shareToken,
                share_url: buildBuyerCatalogUrl(request.nextUrl.origin, shareToken),
              },
            },
            { status: 500 },
          );
        }
      }
    }

    try {
      const ph = getPostHogClient();
      ph.capture({
        distinctId: claims.sub ?? claims.tenant_id,
        event: 'catalog_published',
        properties: {
          campaign_id: id,
          tenant_id: claims.tenant_id,
          scope_type: globalCatalog.scope_type,
          share_token: shareToken,
          notify_whatsapp: publishInput.notify_whatsapp,
        },
      });
      await ph.flush();
    } catch {
      // non-blocking
    }

    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({
      ok: true,
      share_link: {
        share_token: shareToken,
        share_url: buildBuyerCatalogUrl(request.nextUrl.origin, shareToken),
      },
      whatsapp_notify: whatsappNotify,
    });
  }

  if (actionParsed.success && actionParsed.data.action === 'publish_catalog_updates') {
    if (claims.role !== 'seller_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (globalWorkflowStatus.value !== 'published_dirty' || !globalComposerDraft) {
      return NextResponse.json({ error: 'Only live campaigns with unpublished changes can publish updates' }, { status: 400 });
    }

    const buyerNote = actionParsed.data.buyer_note?.trim() ?? globalComposerDraft.message ?? globalCatalog.message ?? null;
    const nextScopeValue = buildScopeValueFromDraft(globalComposerDraft);

    const { data: updatedCatalog, error: updateCatalogError } = await db
      .schema('app')
      .from('campaigns')
      .update({
        name: globalComposerDraft.name,
        scope_type: globalComposerDraft.scope_type,
        scope_value: nextScopeValue,
        valid_from: globalComposerDraft.valid_from,
        valid_to: globalComposerDraft.valid_to,
        message: buyerNote || null,
        ...(actionParsed.data.hero_image_url ? { hero_image_url: actionParsed.data.hero_image_url } : {}),
        updated_by: claims.sub,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .select('id, status')
      .single();

    if (updateCatalogError || !updatedCatalog) {
      return NextResponse.json({ error: 'Failed to publish campaign updates' }, { status: 500 });
    }

    const deletedAt = new Date().toISOString();
    const { error: deleteItemsError } = await db
      .schema('app')
      .from('campaign_items')
      .update({ deleted_at: deletedAt, updated_by: claims.sub })
      .eq('campaign_id', id)
      .is('deleted_at', null);

    if (deleteItemsError) {
      return NextResponse.json({ error: 'Failed to refresh campaign items' }, { status: 500 });
    }

    if (globalComposerDraft.items.length > 0) {
      const { error: insertItemsError } = await db
        .schema('app')
        .from('campaign_items')
        .upsert(
          globalComposerDraft.items.map((item) => ({
            campaign_id: id,
            tenant_product_id: item.tenant_product_id,
            display_order: item.display_order,
            price_override: item.price_override ?? null,
            deleted_at: null,
            created_by: claims.sub,
            updated_by: claims.sub,
          })),
          { onConflict: 'campaign_id,tenant_product_id' },
        );

      if (insertItemsError) {
        return NextResponse.json({ error: 'Failed to save campaign items' }, { status: 500 });
      }
    }

    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({ ok: true, catalog: updatedCatalog });
  }

  if (actionParsed.success && actionParsed.data.action === 'notify_catalog_buyers') {
    if (claims.role !== 'seller_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (globalWorkflowStatus.value !== 'published') {
      return NextResponse.json({ error: 'Only live published campaigns can notify buyers' }, { status: 400 });
    }

    const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
    if (!flagEnabled) {
      return NextResponse.json({ error: 'WhatsApp broadcast feature is not enabled' }, { status: 403 });
    }
    if (actionParsed.data.notify_scheduled_for && new Date(actionParsed.data.notify_scheduled_for).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
    }

    try {
      const whatsappNotify = await queueCampaignFollowupNotify(db, {
        tenantId: claims.tenant_id,
        actorId: claims.sub ?? claims.tenant_id,
        campaignId: id,
        campaignName: (globalCatalog.name as string) ?? 'Campaign',
        scopeType: globalCatalog.scope_type as ScopeType,
        scopeValue: (globalCatalog.scope_value ?? {}) as Record<string, unknown>,
        buyerNote: actionParsed.data.buyer_note?.trim() ?? (globalCatalog.message as string | null) ?? null,
        scheduledFor: actionParsed.data.notify_scheduled_for ?? null,
        heroImageUrl: (globalCatalog.hero_image_url as string | null) ?? null,
        recipientFilter: actionParsed.data.recipient_filter as CatalogNotifyRecipientFilter,
      });

      revalidateSellerDashboardCache(claims.tenant_id);
      return NextResponse.json({ ok: true, whatsapp_notify: whatsappNotify });
    } catch (notifyError) {
      return NextResponse.json(
        { error: notifyError instanceof Error ? notifyError.message : 'Failed to notify buyers' },
        { status: 500 },
      );
    }
  }

  if (actionParsed.success && actionParsed.data.action === 'ensure_share_link') {
    if (globalCatalog.status !== 'published') {
      return NextResponse.json({ error: 'Share links are only available for published catalogs' }, { status: 400 });
    }

    const shareToken = globalCatalog.share_token ?? generateShareToken();
    if (!globalCatalog.share_token) {
      const { error } = await db
        .schema('app')
        .from('campaigns')
        .update({
          share_token: shareToken,
          updated_by: claims.sub,
        })
        .eq('id', id)
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null);

      if (error) return NextResponse.json({ error: 'Failed to generate share link' }, { status: 500 });
      revalidateSellerDashboardCache(claims.tenant_id);
    }

    return NextResponse.json({
      share_link: {
        share_token: shareToken,
        share_url: buildBuyerCatalogUrl(request.nextUrl.origin, shareToken),
      },
    });
  }

  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (actionParsed.success && actionParsed.data.action === 'add_product') {
    if (globalCatalog.status !== 'draft') return NextResponse.json({ error: 'Composition can only be edited for draft catalogs' }, { status: 400 });
    const { error } = await db
      .schema('app')
      .from('campaign_items')
      .insert({
        campaign_id: id,
        tenant_product_id: actionParsed.data.tenant_product_id,
        price_override: actionParsed.data.price_override ?? null,
        created_by: claims.sub,
        updated_by: claims.sub,
      });

    if (error) return NextResponse.json({ error: 'Failed to add product to catalog' }, { status: 500 });
    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({ ok: true });
  }

  if (actionParsed.success && actionParsed.data.action === 'remove_product') {
    if (globalCatalog.status !== 'draft') return NextResponse.json({ error: 'Composition can only be edited for draft catalogs' }, { status: 400 });
    const { error } = await db
      .schema('app')
      .from('campaign_items')
      .update({ deleted_at: new Date().toISOString(), updated_by: claims.sub })
      .eq('campaign_id', id)
      .eq('tenant_product_id', actionParsed.data.tenant_product_id)
      .is('deleted_at', null);

    if (error) return NextResponse.json({ error: 'Failed to remove product from catalog' }, { status: 500 });
    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({ ok: true });
  }

  if (simpleParsed?.success) {
    const payload = simpleParsed.data;
    const buyerTargetMode = payload.buyer_target_mode ?? (payload.target_mode === 'customer_group' ? 'customer_group' : 'manual');
    const productMembershipMode = payload.product_membership_mode ?? 'manual';
    if (payload.target_mode === 'customer_group') {
      const { data: cohort, error: cohortError } = await db
        .schema('app')
        .from('cohorts')
        .select('id')
        .eq('id', payload.target_cohort_id)
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null)
        .maybeSingle();

      if (cohortError) return NextResponse.json({ error: 'Failed to validate cohort' }, { status: 500 });
      if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 400 });
    }

    if (payload.pricing_mode === 'pricelist') {
      const priceListOk = await ensureTenantPriceList(db, claims.tenant_id, payload.price_list_id);
      if (!priceListOk) {
        return NextResponse.json({ error: 'Pricelist not found' }, { status: 400 });
      }
    }
    if (buyerTargetMode === 'manual') {
      const validBuyerIds = await ensureTenantBuyers(db, claims.tenant_id, payload.buyer_ids);
      if (validBuyerIds.size !== payload.buyer_ids.length) {
        return NextResponse.json({ error: 'One or more selected buyers are invalid' }, { status: 400 });
      }
    }
    if (productMembershipMode === 'manual') {
      const validProductIds = await ensureTenantProducts(db, claims.tenant_id, payload.selected_product_ids);
      if (validProductIds.size !== payload.selected_product_ids.length) {
        return NextResponse.json({ error: 'One or more selected products are invalid' }, { status: 400 });
      }
    }

    const liveScopeValue = (globalCatalog.scope_value ?? {}) as {
      composer?: {
        filters?: CatalogComposerFilterState;
        tag_overrides?: Record<string, CatalogComposerTag | null>;
        price_source?: 'price_list' | 'manual';
        price_list_id?: string | null;
        pricing_strategy?: CatalogComposerPricingStrategy;
      };
      composer_draft?: CatalogDraftSnapshot | null;
    };
    const nextScopeValue = {
      ...buildCatalogScopeValue({
        scopeType: payload.target_mode === 'customer_group' ? 'cohort' : 'buyer',
        cohortId: payload.target_mode === 'customer_group' ? payload.target_cohort_id ?? null : null,
        buyerIds: buyerTargetMode === 'manual' ? payload.buyer_ids : [],
        filters: liveScopeValue.composer?.filters ?? defaultCatalogFilters(),
        tagOverrides: liveScopeValue.composer?.tag_overrides ?? {},
        priceSource: payload.pricing_mode === 'pricelist' ? 'price_list' : 'manual',
        priceListId: payload.pricing_mode === 'pricelist' ? payload.price_list_id ?? null : null,
        pricingStrategy: liveScopeValue.composer?.pricing_strategy,
        draft: liveScopeValue.composer_draft ?? null,
      }),
      simple_form: {
        description: payload.description?.trim() ? payload.description.trim() : null,
      },
    };
    const pricingSource = payload.pricing_mode === 'pricelist' ? 'pricelist' : 'individual_prices';
    const campaignPriceListId = payload.pricing_mode === 'pricelist' ? payload.price_list_id ?? null : null;

    const { data: updatedCatalog, error: updateCatalogError } = await db
      .schema('app')
      .from('campaigns')
      .update({
        name: payload.name,
        scope_type: payload.target_mode === 'customer_group' ? 'cohort' : 'buyer',
        scope_value: nextScopeValue,
        valid_from: payload.valid_from.toISOString(),
        valid_to: payload.valid_to ? payload.valid_to.toISOString() : null,
        message: payload.buyer_note?.trim() || null,
        hero_image_url: payload.hero_image_url?.trim() || null,
        buyer_target_mode: buyerTargetMode,
        buyer_filter_rules: buyerTargetMode === 'automatic' ? (payload.buyer_rules ?? null) : null,
        product_membership_mode: productMembershipMode,
        dynamic_rules: productMembershipMode === 'automatic' ? (payload.product_rules ?? null) : null,
        is_dynamic: productMembershipMode === 'automatic',
        pricing_source: pricingSource,
        price_list_id: campaignPriceListId,
        updated_by: claims.sub,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .select('id, status')
      .single();

    if (updateCatalogError || !updatedCatalog) {
      return NextResponse.json({ error: 'Failed to update catalog' }, { status: 500 });
    }

    if (buyerTargetMode === 'automatic' || productMembershipMode === 'automatic') {
      // Mode switch or rule edit -- recompute now (requirement 4).
      const refreshCalls: PromiseLike<unknown>[] = [];
      if (buyerTargetMode === 'automatic') {
        refreshCalls.push(db.schema('app').rpc('refresh_campaign_buyers_by_id', { p_campaign_id: id }));
      }
      if (productMembershipMode === 'automatic') {
        refreshCalls.push(db.schema('app').rpc('refresh_campaign_products_by_id', { p_campaign_id: id }));
      }
      await Promise.all(refreshCalls);
    } else if (productMembershipMode === 'manual') {
      const { data: existingItems, error: existingItemsError } = await db
        .schema('app')
        .from('campaign_items')
        .select('id, tenant_product_id, deleted_at')
        .eq('campaign_id', id);

      if (existingItemsError) {
        return NextResponse.json({ error: 'Failed to sync selected products' }, { status: 500 });
      }

      const existingByProductId = new Map<string, { id: string; tenant_product_id: string; deleted_at: string | null }>(
        (existingItems ?? []).map((item: { id: string; tenant_product_id: string; deleted_at: string | null }) => [item.tenant_product_id, item]),
      );
      const nextSet = new Set(payload.selected_product_ids);
      const idsToSoftDelete = (existingItems ?? [])
        .filter((item: { tenant_product_id: string; deleted_at: string | null }) => !item.deleted_at && !nextSet.has(item.tenant_product_id))
        .map((item: { id: string }) => item.id);

      if (idsToSoftDelete.length > 0) {
        const { error: deleteItemsError } = await db
          .schema('app')
          .from('campaign_items')
          .update({ deleted_at: new Date().toISOString(), updated_by: claims.sub })
          .in('id', idsToSoftDelete);
        if (deleteItemsError) {
          return NextResponse.json({ error: 'Failed to remove unselected products' }, { status: 500 });
        }
      }

      for (const [index, tenantProductId] of payload.selected_product_ids.entries()) {
        const existingItem = existingByProductId.get(tenantProductId);
        if (existingItem) {
          const { error: updateItemError } = await db
            .schema('app')
            .from('campaign_items')
            .update({
              display_order: index,
              deleted_at: null,
              updated_at: new Date().toISOString(),
              updated_by: claims.sub,
            })
            .eq('id', existingItem.id);
          if (updateItemError) {
            return NextResponse.json({ error: 'Failed to update selected products' }, { status: 500 });
          }
          continue;
        }

        const { error: insertItemError } = await db
          .schema('app')
          .from('campaign_items')
          .insert({
            campaign_id: id,
            tenant_product_id: tenantProductId,
            display_order: index,
            price_override: null,
            created_by: claims.sub,
            updated_by: claims.sub,
            deleted_at: null,
          });
        if (insertItemError) {
          return NextResponse.json({ error: 'Failed to add selected products' }, { status: 500 });
        }
      }
    }

    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({ catalog: updatedCatalog });
  }

  if (!composerParsed?.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload = composerParsed.data;
  if (payload.scope_type === 'cohort') {
    const { data: cohort, error: cohortError } = await db
      .schema('app')
      .from('cohorts')
      .select('id')
      .eq('id', payload.cohort_id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (cohortError) return NextResponse.json({ error: 'Failed to validate cohort' }, { status: 500 });
    if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 400 });
  }

  if (payload.scope_type === 'buyer') {
    const validBuyerIds = await ensureTenantBuyers(db, claims.tenant_id, payload.buyer_ids);
    if (validBuyerIds.size !== payload.buyer_ids.length) {
      return NextResponse.json({ error: 'One or more selected buyers are invalid' }, { status: 400 });
    }
  }

  if (payload.price_source === 'price_list') {
    const priceListOk = await ensureTenantPriceList(db, claims.tenant_id, payload.price_list_id);
    if (!priceListOk) {
      return NextResponse.json({ error: 'Pricelist not found' }, { status: 400 });
    }
  }

  const tenantProductIds = payload.items.map((item) => item.tenant_product_id);
  const validProductIds = await ensureTenantProducts(db, claims.tenant_id, tenantProductIds);
  if (validProductIds.size !== tenantProductIds.length) {
    return NextResponse.json({ error: 'One or more selected products are invalid' }, { status: 400 });
  }

  if (globalCatalog.status === 'published' && payload.save_mode === 'draft') {
    const liveScopeValue = (globalCatalog.scope_value ?? {}) as {
      cohort_id?: string;
      buyer_id?: string;
      buyer_ids?: string[];
      composer?: {
        filters?: CatalogComposerFilterState;
        tag_overrides?: Record<string, CatalogComposerTag | null>;
        price_source?: 'price_list' | 'manual';
        price_list_id?: string | null;
        pricing_strategy?: CatalogComposerPricingStrategy;
      };
    };

    const liveScopeType = (globalCatalog.scope_type as ComposerScopeType) === 'all'
      ? 'all'
      : (globalCatalog.scope_type as ComposerScopeType) === 'buyer'
        ? 'buyer'
        : 'cohort';

    const { data: savedDraft, error: saveDraftError } = await db
      .schema('app')
      .from('campaigns')
      .update({
        scope_value: buildCatalogScopeValue({
          scopeType: liveScopeType,
          cohortId: liveScopeValue.cohort_id ?? null,
          buyerIds: liveScopeValue.buyer_ids ?? (liveScopeValue.buyer_id ? [liveScopeValue.buyer_id] : []),
          filters: liveScopeValue.composer?.filters ?? defaultCatalogFilters(),
          tagOverrides: liveScopeValue.composer?.tag_overrides ?? {},
          priceSource: liveScopeValue.composer?.price_source ?? 'manual',
          priceListId: liveScopeValue.composer?.price_list_id ?? null,
          pricingStrategy: liveScopeValue.composer?.pricing_strategy,
          draft: buildCatalogDraftSnapshot(payload),
        }),
        updated_by: claims.sub,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .select('id, status')
      .single();

    if (saveDraftError || !savedDraft) {
      return NextResponse.json({ error: 'Failed to save unpublished changes' }, { status: 500 });
    }

    return NextResponse.json({ catalog: savedDraft });
  }

  if (globalCatalog.status !== 'draft' && !(globalCatalog.status === 'published' && payload.save_mode === 'publish')) {
    return NextResponse.json({ error: 'Composition can only be edited for draft catalogs' }, { status: 400 });
  }

  const isFirstComposerPublish = globalCatalog.status === 'draft' && payload.save_mode === 'publish';
  const buyerNote = (payload.buyer_note ?? payload.message)?.trim() || null;
  const nextScopeValue = buildCatalogScopeValue({
    scopeType: payload.scope_type,
    cohortId: payload.cohort_id,
    buyerIds: payload.buyer_ids,
    filters: payload.filters,
    tagOverrides: payload.tag_overrides,
    priceSource: payload.price_source,
    priceListId: payload.price_list_id,
    pricingStrategy: payload.pricing_strategy,
    draft: null,
  });

  if (isFirstComposerPublish && payload.notify_whatsapp) {
    const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
    if (!flagEnabled) {
      return NextResponse.json({ error: 'WhatsApp broadcast feature is not enabled' }, { status: 403 });
    }

    const preflight = await runCampaignPublishPreflight(db, {
      tenantId: claims.tenant_id,
      scopeType: payload.scope_type,
      scopeValue: nextScopeValue,
      notifyWhatsapp: true,
      buyerNote: payload.buyer_note ?? payload.message ?? '',
    });

    if (!preflight.can_notify) {
      return NextResponse.json(
        { error: preflight.blockers[0] ?? 'WhatsApp notify preflight failed', blockers: preflight.blockers },
        { status: 400 },
      );
    }

    if (payload.notify_scheduled_for && new Date(payload.notify_scheduled_for).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
    }
  }

  const nextStatus: CatalogStatus = payload.save_mode === 'publish' ? 'published' : 'draft';
  const { data: updatedCatalog, error: updateCatalogError } = await db
    .schema('app')
    .from('campaigns')
    .update({
      name: payload.name,
      scope_type: payload.scope_type,
      scope_value: nextScopeValue,
      valid_from: payload.valid_from.toISOString(),
      valid_to: payload.valid_to ? payload.valid_to.toISOString() : null,
      ...(payload.save_mode === 'publish' ? { message: buyerNote } : {}),
      ...(payload.hero_image_url ? { hero_image_url: payload.hero_image_url } : {}),
      status: nextStatus,
      share_token: nextStatus === 'published' ? globalCatalog.share_token ?? generateShareToken() : globalCatalog.share_token,
      updated_by: claims.sub,
    })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .select('id, status')
    .single();

  if (updateCatalogError || !updatedCatalog) {
    return NextResponse.json({ error: 'Failed to update catalog' }, { status: 500 });
  }

  const deletedAt = new Date().toISOString();
  const { error: deleteItemsError } = await db
    .schema('app')
    .from('campaign_items')
    .update({ deleted_at: deletedAt, updated_by: claims.sub })
    .eq('campaign_id', id)
    .is('deleted_at', null);

  if (deleteItemsError) {
    return NextResponse.json({ error: 'Failed to refresh catalog items' }, { status: 500 });
  }

  if (payload.items.length > 0) {
    const { error: insertItemsError } = await db
      .schema('app')
      .from('campaign_items')
      .upsert(
        payload.items.map((item) => ({
          campaign_id: id,
          tenant_product_id: item.tenant_product_id,
          display_order: item.display_order,
          price_override: item.price_override ?? null,
          deleted_at: null,
          created_by: claims.sub,
          updated_by: claims.sub,
        })),
        { onConflict: 'campaign_id,tenant_product_id' },
      );

    if (insertItemsError) {
      return NextResponse.json({ error: 'Failed to save catalog items' }, { status: 500 });
    }
  }

  revalidateSellerDashboardCache(claims.tenant_id);

  let whatsappNotify: { broadcast_id: string; recipient_count: number; scheduled: boolean } | null = null;

  if (isFirstComposerPublish && payload.notify_whatsapp) {
    const { data: publishedCampaign } = await db
      .schema('app')
      .from('campaigns')
      .select('id, name, scope_type, scope_value, hero_image_url, message')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    if (publishedCampaign) {
      try {
        whatsappNotify = await queueCampaignPublishNotify(db, {
          tenantId: claims.tenant_id,
          actorId: claims.sub ?? claims.tenant_id,
          campaignId: id,
          campaignName: publishedCampaign.name as string,
          scopeType: publishedCampaign.scope_type as ScopeType,
          scopeValue: (publishedCampaign.scope_value ?? {}) as Record<string, unknown>,
          buyerNote: (publishedCampaign.message as string | null) ?? buyerNote,
          scheduledFor: payload.notify_scheduled_for ?? null,
          heroImageUrl: publishedCampaign.hero_image_url as string | null,
        });
      } catch (notifyError) {
        console.error('[PATCH /api/tenant/catalogs/:id] WhatsApp notify failed after publish:', notifyError);
        return NextResponse.json(
          {
            error: notifyError instanceof Error ? notifyError.message : 'Campaign published but WhatsApp notify failed',
            catalog: updatedCatalog,
          },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({ catalog: updatedCatalog, whatsapp_notify: whatsappNotify });
}
