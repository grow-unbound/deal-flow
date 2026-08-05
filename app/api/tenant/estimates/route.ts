import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { FEATURE_FLAGS } from '@/constants';
import { loadEstimateDocument } from '@/lib/estimates/load-tenant-estimate-composer';
import { isoDateInTimeZone, offsetIsoDateInTimeZone } from '@/lib/date-utils';
import { getFlag } from '@/lib/flags';
import { getInAppCreateFlags } from '@/lib/server/seller-features';
import { PAGE_SIZE, encodeCursor, decodeCursor } from '@/lib/pagination';
import {
  applySellerLocationScope,
  loadAccessibleSellerLocations,
  resolveDefaultSellerLocationId,
} from '@/lib/server/seller-location-access';
import { getAuthUserDisplayNameMap } from '@/lib/server/auth-user-directory';
import { supabaseAdmin } from '@/lib/supabase';
import { createTimer } from '@/lib/server-timing';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { readArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';
import { applyTransactionTableSearch, loadTransactionSearchScopeIds } from '@/lib/server/document-table-search';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

import type {
  EstimateAvatarHue,
  EstimateDbStatus,
  EstimateFilterChip,
  EstimateLandingRow,
  EstimateStatusTone,
} from '@/types/tenant-estimates';

interface BuyerRow {
  id: string;
  business_name: string;
  geography: Record<string, unknown> | null;
}

interface EstimateDbRow {
  id: string;
  location_id: string | null;
  estimate_number: string | null;
  buyer_id: string;
  status: string;
  total_amount: number | string | null;
  estimate_date: string | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  expires_at: string | null;
  valid_until: string | null;
  source: string | null;
  is_buyer_app_estimate: boolean;
  campaign_id: string | null;
  place_of_supply: string | null;
  created_by: string | null;
  updated_at?: string | null;
}

interface EstimateItemCountRow {
  estimate_id: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getHue(index: number): EstimateAvatarHue {
  if (index % 3 === 0) return 'teal';
  if (index % 3 === 1) return 'ember';
  return 'cream';
}

function normalizeStatus(raw: string): Exclude<EstimateDbStatus, 'pending'> {
  const allowed: Exclude<EstimateDbStatus, 'pending'>[] = [
    'draft',
    'sent',
    'accepted',
    'declined',
    'expired',
    'converted',
    'invoiced',
    'void',
  ];
  if (allowed.includes(raw as Exclude<EstimateDbStatus, 'pending'>)) {
    return raw as Exclude<EstimateDbStatus, 'pending'>;
  }
  return 'draft';
}

function isOpenStatus(s: Exclude<EstimateDbStatus, 'pending'>): boolean {
  return s === 'draft' || s === 'sent' || s === 'accepted';
}

function statusMeta(status: Exclude<EstimateDbStatus, 'pending'>): {
  label: string;
  tone: EstimateStatusTone;
  filter_chip: EstimateFilterChip;
} {
  if (status === 'draft') return { label: 'Draft', tone: 'neutral', filter_chip: 'Draft' };
  if (status === 'sent') return { label: 'Sent', tone: 'warning', filter_chip: 'Sent' };
  if (status === 'accepted') return { label: 'Accepted', tone: 'success', filter_chip: 'Accepted' };
  if (status === 'declined') return { label: 'Declined', tone: 'neutral', filter_chip: 'Declined' };
  if (status === 'expired') return { label: 'Expired', tone: 'neutral', filter_chip: 'Expired' };
  if (status === 'converted') return { label: 'Converted', tone: 'success', filter_chip: 'Converted' };
  if (status === 'invoiced') return { label: 'Invoiced', tone: 'success', filter_chip: 'Converted' };
  if (status === 'void') return { label: 'Void', tone: 'neutral', filter_chip: 'Draft' };
  return { label: status, tone: 'neutral', filter_chip: 'All' };
}

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function estimateStatusesForFilters(values: string[]) {
  const statuses = new Set<string>();
  values.forEach((value) => {
    if (value === 'Draft') statuses.add('draft');
    if (value === 'Sent') statuses.add('sent');
    if (value === 'Accepted') statuses.add('accepted');
    if (value === 'Declined') statuses.add('declined');
    if (value === 'Expired') statuses.add('expired');
  if (value === 'Converted') {
    statuses.add('converted');
    statuses.add('invoiced');
  }
  });
  return Array.from(statuses);
}

function getEstimateDocumentTimestamp(row: Pick<EstimateDbRow, 'estimate_date' | 'created_at'>): string {
  return row.estimate_date ?? row.created_at;
}

function isBuyerAppEstimate(row: Pick<EstimateDbRow, 'is_buyer_app_estimate' | 'source'>): boolean {
  return row.is_buyer_app_estimate || row.source === 'buyer_app';
}

function resolveEstimateExpiresAt(row: Pick<EstimateDbRow, 'expires_at' | 'valid_until'>): string | null {
  if (row.expires_at) return row.expires_at;
  const validUntil = toText(row.valid_until);
  if (!validUntil) return null;
  return validUntil.includes('T') ? validUntil : `${validUntil}T23:59:59.000Z`;
}

function applyEstimateSourceFilter<T extends {
  eq: (column: string, value: unknown) => T;
  or: (filter: string) => T;
}>(query: T, sourceParams: string[]): T {
  if (sourceParams.length !== 1) return query;
  if (sourceParams[0] === 'Buyer App') {
    return query.or('is_buyer_app_estimate.eq.true,source.eq.buyer_app');
  }
  if (sourceParams[0] === 'Direct') {
    return query.eq('is_buyer_app_estimate', false).or('source.is.null,source.neq.buyer_app');
  }
  return query;
}

function applyEstimateDocumentPeriod<T extends { or: (filter: string) => T }>(query: T, start: string, endExclusive: string): T {
  return query.or(
    `and(estimate_date.gte.${start},estimate_date.lt.${endExclusive}),and(estimate_date.is.null,created_at.gte.${start},created_at.lt.${endExclusive})`,
  );
}

function parseEstimateFilterPreset(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function attentionFromEstimatePreset(preset: Record<string, unknown> | null): string[] {
  if (!preset) return [];
  if (preset.status === 'sent' && Number(preset.age_gte_days ?? 0) >= 3) return ['awaiting_action_3d'];
  if (Number(preset.expiry_lte_days ?? 0) > 0) return ['expiring_7d'];
  return [];
}

function statusesFromEstimatePreset(preset: Record<string, unknown> | null): string[] {
  if (!preset) return [];
  if (preset.status === 'open') return ['Draft', 'Sent', 'Accepted'];
  if (preset.status === 'sent') return ['Sent'];
  return [];
}

function applyEstimateAttentionFilter(query: any, attention: string[]) {
  let next = query;
  const now = new Date();
  if (attention.includes('awaiting_action_3d')) {
    next = next.eq('status', 'sent').lt('sent_at', new Date(now.getTime() - 3 * DAY_MS).toISOString());
  }
  if (attention.includes('expiring_7d')) {
    next = next
      .in('status', ['draft', 'sent', 'accepted'])
      .not('expires_at', 'is', null)
      .lte('expires_at', new Date(now.getTime() + 7 * DAY_MS).toISOString());
  }
  return next;
}

function applyEstimateCursor<T extends { or: (filter: string) => T }>(query: T, cursor: string): T {
  const { created_at, id } = decodeCursor(cursor);
  return query.or(
    `and(estimate_date.lt.${created_at}),and(estimate_date.eq.${created_at},id.lt.${id}),and(estimate_date.is.null,created_at.lt.${created_at}),and(estimate_date.is.null,created_at.eq.${created_at},id.lt.${id})`,
  );
}

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    return jsonWithServerTiming(body, timer, 'estimates_api', init, APP_GET_CACHE_CONTROL);
  };

  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return timedJson({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return timedJson({ error: 'Server configuration error' }, { status: 500 });
    }

    const tenantId = claims.tenant_id;
    const period = getSellerLandingPeriodMeta(req.nextUrl.searchParams.get('period'));
    const db = supabaseAdmin;
    const availableLocations = await loadAccessibleSellerLocations(db as any, claims.tenant_id, claims);
    const limit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const cursorParam = req.nextUrl.searchParams.get('cursor');
    const searchParam = req.nextUrl.searchParams.get('search')?.trim();
    const filterPreset = parseEstimateFilterPreset(req.nextUrl.searchParams.get('filter_preset'));
    const sourceParams = readArrayParam(req.nextUrl.searchParams, 'source');
    const explicitStatusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const explicitAttentionParams = readArrayParam(req.nextUrl.searchParams, 'attention');
    const statusParams = explicitStatusParams.length > 0 ? explicitStatusParams : statusesFromEstimatePreset(filterPreset);
    const attentionParams = explicitAttentionParams.length > 0 ? explicitAttentionParams : attentionFromEstimatePreset(filterPreset);
    const locationParams = readArrayParam(req.nextUrl.searchParams, 'location_id');
    const searchScope = searchParam ? await loadTransactionSearchScopeIds(db, tenantId, searchParam) : { buyerIds: [], locationIds: [] };

    const buildBaseEstimateQuery = () => {
      return applySellerLocationScope(
        db
          .schema('app')
          .from('estimates')
          .select(
            'id, location_id, estimate_number, buyer_id, status, total_amount, estimate_date, created_at, sent_at, accepted_at, expires_at, valid_until, source, is_buyer_app_estimate, campaign_id, place_of_supply, created_by, updated_at',
          )
          .eq('tenant_id', tenantId)
          .is('deleted_at', null) as any,
        claims,
      );
    };

    let scopedEstimatesQuery = buildBaseEstimateQuery() as any;
    scopedEstimatesQuery = applyEstimateDocumentPeriod(scopedEstimatesQuery, period.current_start, period.current_end_exclusive);
    scopedEstimatesQuery = scopedEstimatesQuery
      .order('estimate_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (cursorParam) {
      scopedEstimatesQuery = applyEstimateCursor(scopedEstimatesQuery, cursorParam);
    }
    scopedEstimatesQuery = applyTransactionTableSearch(scopedEstimatesQuery, 'estimate_number', searchParam ?? '', searchScope.buyerIds, searchScope.locationIds);
    scopedEstimatesQuery = applyEstimateSourceFilter(scopedEstimatesQuery, sourceParams);
    if (statusParams.length > 0) {
      scopedEstimatesQuery = scopedEstimatesQuery.in('status', estimateStatusesForFilters(statusParams));
    }
    if (attentionParams.length > 0) {
      scopedEstimatesQuery = applyEstimateAttentionFilter(scopedEstimatesQuery, attentionParams);
    }
    if (locationParams.length > 0) {
      scopedEstimatesQuery = scopedEstimatesQuery.in('location_id', locationParams);
    }
    scopedEstimatesQuery = scopedEstimatesQuery.limit(limit + 1);

    const estimatesRes = await scopedEstimatesQuery;

    if (estimatesRes.error) {
      console.error(
        '[GET /api/tenant/estimates] query error:',
        estimatesRes.error,
      );
      return timedJson({ error: 'Failed to fetch estimates' }, { status: 500 });
    }

    const allFetched = (estimatesRes.data ?? []) as EstimateDbRow[];
    const hasNextPage = allFetched.length > limit;
    const rawEstimates = hasNextPage ? allFetched.slice(0, limit) : allFetched;
    const lastEstimate = rawEstimates.at(-1);
    const nextCursor = hasNextPage && lastEstimate
      ? encodeCursor({ created_at: getEstimateDocumentTimestamp(lastEstimate), id: lastEstimate.id })
      : null;
    const lookupRows = rawEstimates;

    // Scope the buyers lookup to only the buyer IDs referenced by the fetched estimates.
    // Previously this loaded all buyers for the tenant on every request.
    const estimateBuyerIds = Array.from(new Set(lookupRows.map((e) => e.buyer_id).filter(Boolean)));
    const buyersRes = estimateBuyerIds.length > 0
      ? await db
          .schema('app')
          .from('buyers')
          .select('id, business_name, geography')
          .in('id', estimateBuyerIds)
          .is('deleted_at', null)
      : { data: [] as BuyerRow[], error: null };

    if (buyersRes.error) {
      console.error('[GET /api/tenant/estimates] buyers query error:', buyersRes.error);
      return timedJson({ error: 'Failed to fetch estimates' }, { status: 500 });
    }

    const buyers = (buyersRes.data ?? []) as BuyerRow[];

    const buyerById = new Map<string, BuyerRow>();
    for (const buyer of buyers) {
      buyerById.set(buyer.id, buyer);
    }

    const catalogIds = Array.from(
      new Set(lookupRows.map((row) => row.campaign_id).filter((value): value is string => Boolean(value))),
    );
    const creatorIds = Array.from(
      new Set(
        lookupRows
          .filter((row) => !isBuyerAppEstimate(row) && row.created_by)
          .map((row) => row.created_by as string),
      ),
    );

    const [catalogsRes, creatorMap] = await Promise.all([
      catalogIds.length > 0
        ? db.schema('app').from('campaigns').select('id, name').in('id', catalogIds).is('deleted_at', null)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
      getAuthUserDisplayNameMap(creatorIds),
    ]);

    if (catalogsRes.error) {
      console.error('[GET /api/tenant/estimates] campaigns error:', catalogsRes.error);
      return timedJson({ error: 'Failed to fetch estimates' }, { status: 500 });
    }

    const catalogById = new Map<string, string>(
      ((catalogsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
    );

    const estimateIds = lookupRows.map((e) => e.id);
    const itemCountByEstimate = new Map<string, number>();

    if (estimateIds.length > 0) {
      const itemsRes = await db
        .schema('app')
        .from('estimate_items')
        .select('estimate_id')
        .in('estimate_id', estimateIds)
        .is('deleted_at', null);

      if (itemsRes.error) {
        console.error('[GET /api/tenant/estimates] estimate_items error:', itemsRes.error);
        return timedJson({ error: 'Failed to fetch estimates' }, { status: 500 });
      }

      const rows = (itemsRes.data ?? []) as EstimateItemCountRow[];
      for (const row of rows) {
        itemCountByEstimate.set(row.estimate_id, (itemCountByEstimate.get(row.estimate_id) ?? 0) + 1);
      }
    }

    const locationNameById = new Map(availableLocations.map((location) => [location.id, location.name]));

    const normalizeLanding = (row: EstimateDbRow, index: number) => {
      const norm = normalizeStatus(row.status);
      const buyer = buyerById.get(row.buyer_id);
      const buyerName = buyer?.business_name ?? 'Unknown buyer';
      const geography = buyer?.geography ?? null;
      const buyerCity = toText(geography?.city);
      const buyerState = toText(geography?.state);
      const placeOfSupply = toText(row.place_of_supply) ?? buyerCity ?? buyerState ?? null;
      const meta = statusMeta(norm);
      const buyerApp = isBuyerAppEstimate(row);
      const source: 'buyer_app' | 'seller' = buyerApp ? 'buyer_app' : 'seller';
      const createdByLabel = source === 'seller' ? creatorMap.get(row.created_by ?? '') ?? 'Team member' : null;
      const catalogName = row.campaign_id ? catalogById.get(row.campaign_id) ?? null : null;
      const landing: EstimateLandingRow = {
        id: row.id,
        location_id: row.location_id,
        location_name: row.location_id ? locationNameById.get(row.location_id) ?? null : null,
        estimate_number: row.estimate_number ?? '—',
        buyer_id: row.buyer_id,
        buyer_name: buyerName,
        place_of_supply: placeOfSupply,
        buyer_city: buyerCity,
        buyer_state: buyerState,
        buyer_initials: getInitials(buyerName),
        buyer_hue: getHue(index),
        source,
        source_kind: source,
        source_label: buyerApp ? 'BUYER APP' : '',
        source_detail: '',
        campaign_name: catalogName,
        catalog_name: catalogName,
        created_by_label: createdByLabel,
        items_count: itemCountByEstimate.get(row.id) ?? 0,
        total_amount: Number(row.total_amount ?? 0),
        expires_at: resolveEstimateExpiresAt(row),
        created_at: getEstimateDocumentTimestamp(row),
        accepted_at: row.accepted_at,
        sent_at: row.sent_at,
        status: {
          value: norm as EstimateDbStatus,
          label: meta.label,
          tone: meta.tone,
          filter_chip: meta.filter_chip,
        },
      };
      return { row, norm, landing };
    };

    const normalized = rawEstimates.map((row, index) => normalizeLanding(row, index));

    const estimates = normalized.map((n) => n.landing);
    const filters: LandingFilterMeta = {
      groups: [
        {
          key: 'source',
          label: 'Source',
          options: [
            { value: 'Buyer App', label: 'Buyer App' },
            { value: 'Direct', label: 'Direct' },
          ],
        },
        {
          key: 'status',
          label: 'Status',
          options: ['Draft', 'Sent', 'Accepted', 'Converted', 'Declined', 'Expired'].map((value) => ({ value, label: value })),
        },
        {
          key: 'attention',
          label: 'Attention',
          options: [
            { value: 'awaiting_action_3d', label: 'Awaiting action 3+ days' },
            { value: 'expiring_7d', label: 'Expiring in 7 days' },
          ],
        },
        {
          key: 'location_id',
          label: 'Location',
          options: availableLocations.map((location) => ({ value: location.id, label: location.name })),
        },
      ],
    };

    const payload = {
      period,
      estimates,
      filters,
      nextCursor,
      total: null,
    };

    return timedJson(payload);
  } catch (error) {
    console.error('[GET /api/tenant/estimates] unexpected error:', error);
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }
}

function formatEstimateNumber(sequence: number): string {
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
  }).format(new Date());
  return `EST-${year}-${String(sequence).padStart(5, '0')}`;
}

const EstimateCreateItemSchema = z.object({
  tenant_product_id: z.string().uuid(),
  qty: z.number().positive(),
  unit_price: z.number().min(0),
  disc_pct: z.number().min(0).max(100),
  tax_pct: z.number().min(0).max(100),
  scheme_tag: z.string().nullable().optional(),
});

const EstimateCreatePayloadSchema = z.object({
  buyer_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  estimate_date: z.string().optional(),
  valid_until: z.string().optional(),
  buyer_po_ref: z.string().max(255).optional(),
  place_of_supply: z.string().max(120).optional(),
  seller_note: z.string().max(8000).optional(),
  freight: z.number().min(0).optional(),
  discount_flat: z.number().min(0).optional(),
  round_off: z.number().optional(),
  items: z.array(EstimateCreateItemSchema).optional(),
}).optional();

export async function POST(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);

    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, estimatesFlag, createFlags] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
      getInAppCreateFlags(claims.tenant_id),
    ]);
    if (!orderMgmt || !estimatesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }
    if (!createFlags.create_enquiries) {
      return NextResponse.json({ error: 'Estimate creation is disabled for this tenant' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    let rawBody: unknown = {};
    try { rawBody = await request.json(); } catch { /* empty body is fine */ }
    const parsedPayload = EstimateCreatePayloadSchema.safeParse(rawBody);
    const payload = parsedPayload.success ? parsedPayload.data : undefined;

    const db = supabaseAdmin as any;

    const estimateCountRes = await db
        .schema('app')
        .from('estimates')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', claims.tenant_id);

    if (estimateCountRes.error) {
      console.error('[POST /api/tenant/estimates] draft bootstrap error', estimateCountRes.error);
      return NextResponse.json({ error: 'Failed to create estimate draft' }, { status: 500 });
    }

    const today = isoDateInTimeZone(new Date());
    const defaultValidUntil = offsetIsoDateInTimeZone(new Date(), 14);
    const validUntil = payload?.valid_until ?? defaultValidUntil;

    const estimateNumber = formatEstimateNumber((estimateCountRes.count ?? 0) + 1);
    const availableLocations = await loadAccessibleSellerLocations(db as any, claims.tenant_id, claims);
    const resolvedDefaultLocationId = resolveDefaultSellerLocationId(claims, availableLocations);
    const locationId = payload?.location_id ?? resolvedDefaultLocationId;
    if (!locationId) {
      return NextResponse.json({ error: 'No accessible location available for this user' }, { status: 400 });
    }

    type CreateItem = z.infer<typeof EstimateCreateItemSchema>;
    const items: CreateItem[] = payload?.items ?? [];
    const subtotal = items.reduce((sum, item) => sum + item.qty * item.unit_price * (1 - item.disc_pct / 100), 0);
    const taxAmount = items.reduce((sum, item) => {
      const taxable = item.qty * item.unit_price * (1 - item.disc_pct / 100);
      return sum + taxable * (item.tax_pct / 100);
    }, 0);
    const discountFlat = payload?.discount_flat ?? 0;
    const freight = payload?.freight ?? 0;
    const roundOff = payload?.round_off ?? 0;
    const grandTotal = Math.max(subtotal - discountFlat, 0) + taxAmount + freight + roundOff;

    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('estimates')
      .insert({
        tenant_id: claims.tenant_id,
        location_id: locationId,
        buyer_id: payload?.buyer_id ?? null,
        estimate_number: estimateNumber,
        status: 'draft',
        source: 'seller',
        subtotal,
        tax_amount: taxAmount,
        total_amount: grandTotal,
        estimate_date: payload?.estimate_date ?? today,
        valid_until: validUntil,
        expires_at: `${validUntil}T23:59:59.000Z`,
        buyer_po_ref: payload?.buyer_po_ref || null,
        place_of_supply: payload?.place_of_supply?.trim() ?? '',
        notes: payload?.seller_note || null,
        discount_flat: discountFlat,
        freight,
        round_off: roundOff,
        created_by: claims.sub,
        updated_by: claims.sub,
      })
      .select('id')
      .single();

    if (insertError || !inserted?.id) {
      console.error('[POST /api/tenant/estimates] insert error', insertError);
      return NextResponse.json({ error: 'Failed to create estimate' }, { status: 500 });
    }

    if (items.length > 0) {
      const { error: itemsError } = await db
        .schema('app')
        .from('estimate_items')
        .insert(
          items.map((item) => {
            const discounted = item.qty * item.unit_price * (1 - item.disc_pct / 100);
            return {
              estimate_id: inserted.id,
              tenant_product_id: item.tenant_product_id,
              qty: item.qty,
              unit_price: item.unit_price,
              discount_pct: item.disc_pct,
              disc_pct: item.disc_pct,
              tax_rate: item.tax_pct,
              tax_pct: item.tax_pct,
              line_total: discounted + discounted * (item.tax_pct / 100),
              scheme_tag: item.scheme_tag ?? null,
              created_by: claims.sub,
              updated_by: claims.sub,
            };
          }),
        );
      if (itemsError) {
        console.error('[POST /api/tenant/estimates] items insert error', itemsError);
      }
    }

    const composerDoc = await loadEstimateDocument(supabaseAdmin as DbClient, claims.tenant_id, inserted.id, claims.role ?? null, claims);
    if (!composerDoc || composerDoc === 'forbidden') {
      return NextResponse.json({ error: 'Estimate created but could not be loaded' }, { status: 500 });
    }
    return NextResponse.json({ data: composerDoc.composerPayload });
  } catch (error) {
    console.error('[POST /api/tenant/estimates]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
