import { NextRequest, NextResponse } from 'next/server';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

import type {
  EstimateAvatarHue,
  EstimateCalloutRow,
  EstimateDbStatus,
  EstimateFilterChip,
  EstimateLandingRow,
  EstimateStatusTone,
  EstimatesKpis,
  EstimatesTodaysRead,
  TenantEstimatesResponse,
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

function sumMetric(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

function getEstimateDocumentTimestamp(row: Pick<EstimateDbRow, 'estimate_date' | 'created_at'>): string {
  return row.estimate_date ?? row.created_at;
}

function applyEstimateDocumentPeriod<T extends { or: (filter: string) => T }>(query: T, start: string, endExclusive: string): T {
  return query.or(
    `and(estimate_date.gte.${start},estimate_date.lt.${endExclusive}),and(estimate_date.is.null,created_at.gte.${start},created_at.lt.${endExclusive})`,
  );
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
    const scopedLocationIds = availableLocations.map((location) => location.id);
    const aggregateScope = claims.role === 'seller_admin' ? 'tenant' : 'location';
    const limit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const cursorParam = req.nextUrl.searchParams.get('cursor');
    const searchParam = req.nextUrl.searchParams.get('search')?.trim();
    const sourceParams = readArrayParam(req.nextUrl.searchParams, 'source');
    const statusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const locationParams = readArrayParam(req.nextUrl.searchParams, 'location_id');

    const buildBaseEstimateQuery = () => {
      return applySellerLocationScope(
        db
          .schema('app')
          .from('estimates')
          .select(
            'id, location_id, estimate_number, buyer_id, status, total_amount, estimate_date, created_at, sent_at, accepted_at, expires_at, source, is_buyer_app_estimate, campaign_id, place_of_supply, created_by, updated_at',
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
    if (searchParam) {
      scopedEstimatesQuery = scopedEstimatesQuery.ilike('estimate_number', `%${searchParam}%`);
    }
    if (sourceParams.length === 1) {
      scopedEstimatesQuery = scopedEstimatesQuery.eq('is_buyer_app_estimate', sourceParams[0] === 'Buyer App');
    }
    if (statusParams.length > 0) {
      scopedEstimatesQuery = scopedEstimatesQuery.in('status', estimateStatusesForFilters(statusParams));
    }
    if (locationParams.length > 0) {
      scopedEstimatesQuery = scopedEstimatesQuery.in('location_id', locationParams);
    }
    scopedEstimatesQuery = scopedEstimatesQuery.limit(limit + 1);

    let estimateTotalQuery = applySellerLocationScope(
      db
        .schema('app')
        .from('estimates')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null) as any,
      claims,
    );
    estimateTotalQuery = applyEstimateDocumentPeriod(estimateTotalQuery, period.current_start, period.current_end_exclusive);
    if (searchParam) {
      estimateTotalQuery = estimateTotalQuery.ilike('estimate_number', `%${searchParam}%`);
    }
    if (sourceParams.length === 1) {
      estimateTotalQuery = estimateTotalQuery.eq('is_buyer_app_estimate', sourceParams[0] === 'Buyer App');
    }
    if (statusParams.length > 0) {
      estimateTotalQuery = estimateTotalQuery.in('status', estimateStatusesForFilters(statusParams));
    }
    if (locationParams.length > 0) {
      estimateTotalQuery = estimateTotalQuery.in('location_id', locationParams);
    }

    const buildEstimateKpiQuery = (opts?: { start?: string; endExclusive?: string }) => {
      if (aggregateScope === 'location' && scopedLocationIds.length === 0) {
        return Promise.resolve({ data: [], error: null });
      }

      let query = db
        .schema('app')
        .from('kpi_estimates_daily')
        .select('estimates_count, gmv, open_count, accepted_count, converted_count, draft_count, sent_count, expiring_soon_count, open_buyer_app_count')
        .eq('tenant_id', tenantId)
        .eq('scope', aggregateScope);

      if (opts?.start) {
        query = query.gte('day', opts.start.slice(0, 10));
      }
      if (opts?.endExclusive) {
        query = query.lt('day', opts.endExclusive.slice(0, 10));
      }
      if (aggregateScope === 'location') {
        query = query.in('location_id', scopedLocationIds);
      }

      return query;
    };

    const buildEstimateCalloutQuery = (mode: 'needs_follow_up' | 'ready_to_convert' | 'expiring_soon') => {
      let query = buildBaseEstimateQuery() as any;
      query = applyEstimateDocumentPeriod(query, period.current_start, period.current_end_exclusive);

      if (mode === 'needs_follow_up') {
        return query
          .eq('status', 'sent')
          .order('sent_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: false })
          .limit(3);
      }

      if (mode === 'ready_to_convert') {
        return query
          .eq('status', 'accepted')
          .order('total_amount', { ascending: false })
          .order('id', { ascending: false })
          .limit(3);
      }

      return query
        .in('status', ['draft', 'sent', 'accepted'])
        .lte('expires_at', new Date(Date.now() + 7 * DAY_MS).toISOString())
        .order('expires_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(3);
    };

    const [estimatesRes, estimateTotalRes, currentPeriodRes, previousPeriodRes, aggregateRes, needsFollowUpRes, readyToConvertRes, expiringSoonRes] = await Promise.all([
      scopedEstimatesQuery,
      estimateTotalQuery,
      buildEstimateKpiQuery({ start: period.current_start, endExclusive: period.current_end_exclusive }),
      buildEstimateKpiQuery({ start: period.previous_start, endExclusive: period.previous_end_exclusive }),
      buildEstimateKpiQuery(),
      buildEstimateCalloutQuery('needs_follow_up'),
      buildEstimateCalloutQuery('ready_to_convert'),
      buildEstimateCalloutQuery('expiring_soon'),
    ]);

    if (estimatesRes.error || estimateTotalRes.error || currentPeriodRes.error || previousPeriodRes.error || aggregateRes.error || needsFollowUpRes.error || readyToConvertRes.error || expiringSoonRes.error) {
      console.error(
        '[GET /api/tenant/estimates] query error:',
        estimatesRes.error || estimateTotalRes.error || currentPeriodRes.error || previousPeriodRes.error || aggregateRes.error || needsFollowUpRes.error || readyToConvertRes.error || expiringSoonRes.error,
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
    const calloutRows = [
      ...((needsFollowUpRes.data ?? []) as EstimateDbRow[]),
      ...((readyToConvertRes.data ?? []) as EstimateDbRow[]),
      ...((expiringSoonRes.data ?? []) as EstimateDbRow[]),
    ];
    const lookupRows = Array.from(new Map([...rawEstimates, ...calloutRows].map((row) => [row.id, row])).values());
    const totalCount = estimateTotalRes.count ?? null;

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
          .filter((row) => !row.is_buyer_app_estimate && row.created_by)
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

    const now = Date.now();
    const expiringCutoff = now + 7 * DAY_MS;
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
      const source: 'buyer_app' | 'seller' = row.is_buyer_app_estimate ? 'buyer_app' : 'seller';
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
        source_label: source === 'buyer_app' ? 'Buyer App' : `created by ${createdByLabel ?? 'Team member'}`,
        source_detail: source === 'buyer_app' ? 'Submitted via Buyer App' : 'Manual seller entry',
        campaign_name: catalogName,
        catalog_name: catalogName,
        created_by_label: createdByLabel,
        items_count: itemCountByEstimate.get(row.id) ?? 0,
        total_amount: Number(row.total_amount ?? 0),
        expires_at: row.expires_at,
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

    const totalEstimatesThisPeriod = sumMetric((currentPeriodRes.data ?? []) as Array<Record<string, unknown>>, 'estimates_count');
    const totalEstimatesPrevPeriod = sumMetric((previousPeriodRes.data ?? []) as Array<Record<string, unknown>>, 'estimates_count');
    const totalGmvThisPeriod = sumMetric((currentPeriodRes.data ?? []) as Array<Record<string, unknown>>, 'gmv');
    const totalGmvPrevPeriod = sumMetric((previousPeriodRes.data ?? []) as Array<Record<string, unknown>>, 'gmv');
    const totalEstimatesGrowthPct =
      totalEstimatesPrevPeriod > 0 ? Math.round(((totalEstimatesThisPeriod - totalEstimatesPrevPeriod) / totalEstimatesPrevPeriod) * 100) : 0;
    const aov = totalEstimatesThisPeriod > 0 ? totalGmvThisPeriod / totalEstimatesThisPeriod : 0;
    const openEstimatesThisPeriod = sumMetric((currentPeriodRes.data ?? []) as Array<Record<string, unknown>>, 'open_count');
    const openCreatedThisPeriod = openEstimatesThisPeriod;
    const buyerAppCreatedThisPeriod = sumMetric((currentPeriodRes.data ?? []) as Array<Record<string, unknown>>, 'open_buyer_app_count');
    const openDraftsAggregate = sumMetric((aggregateRes.data ?? []) as Array<Record<string, unknown>>, 'draft_count');
    const openSentAggregate = sumMetric((aggregateRes.data ?? []) as Array<Record<string, unknown>>, 'sent_count');
    const openAcceptedAggregate = sumMetric((aggregateRes.data ?? []) as Array<Record<string, unknown>>, 'accepted_count');
    const openTotalAggregate = sumMetric((aggregateRes.data ?? []) as Array<Record<string, unknown>>, 'open_count');
    const expiringSoonAggregate = sumMetric((aggregateRes.data ?? []) as Array<Record<string, unknown>>, 'expiring_soon_count');

    const kpis: EstimatesKpis = {
      total_estimates_this_period: totalEstimatesThisPeriod,
      total_estimates_prev_period: totalEstimatesPrevPeriod,
      total_estimates_growth_pct: totalEstimatesGrowthPct,
      total_gmv_this_period: totalGmvThisPeriod,
      total_gmv_prev_period: totalGmvPrevPeriod,
      aov,
      open_estimates_this_period: openEstimatesThisPeriod,
      converted_this_period: sumMetric((currentPeriodRes.data ?? []) as Array<Record<string, unknown>>, 'converted_count'),
      open_total: openTotalAggregate,
      open_drafts: openDraftsAggregate,
      open_sent: openSentAggregate,
      open_accepted: openAcceptedAggregate,
      ready_to_convert: openAcceptedAggregate,
      expiring_soon: expiringSoonAggregate,
      open_created_this_period: openCreatedThisPeriod,
      buyer_app_created_this_period: buyerAppCreatedThisPeriod,
    };

    const toCalloutRow = (landing: EstimateLandingRow): EstimateCalloutRow => ({
      id: landing.id,
      estimate_number: landing.estimate_number,
      buyer_name: landing.buyer_name,
      buyer_initials: landing.buyer_initials,
      buyer_hue: landing.buyer_hue,
      items_count: landing.items_count,
      total_amount: landing.total_amount,
      sent_at: landing.sent_at,
      expires_at: landing.expires_at,
      status: { label: landing.status.label, tone: landing.status.tone },
    });

    const threeDaysAgo = now - 3 * DAY_MS;
    const needsFollowUp = ((needsFollowUpRes.data ?? []) as EstimateDbRow[])
      .map((row, index) => normalizeLanding(row, index))
      .filter((entry) => entry.row.sent_at && new Date(entry.row.sent_at).getTime() < threeDaysAgo)
      .map((entry) => toCalloutRow(entry.landing));

    const readyCallout = ((readyToConvertRes.data ?? []) as EstimateDbRow[])
      .map((row, index) => normalizeLanding(row, index))
      .map((entry) => toCalloutRow(entry.landing));

    const expiringCallout = ((expiringSoonRes.data ?? []) as EstimateDbRow[])
      .map((row, index) => normalizeLanding(row, index))
      .filter((entry) => isOpenStatus(entry.norm) && entry.row.expires_at)
      .filter((entry) => new Date(entry.row.expires_at as string).getTime() <= expiringCutoff)
      .map((entry) => toCalloutRow(entry.landing));

    const todays_read: EstimatesTodaysRead = {
      needs_follow_up: needsFollowUp,
      ready_to_convert: readyCallout,
      expiring_soon: expiringCallout,
    };

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
          key: 'location_id',
          label: 'Location',
          options: availableLocations.map((location) => ({ value: location.id, label: location.name })),
        },
      ],
    };

    const payload = {
      period,
      kpis,
      todays_read,
      estimates,
      filters,
      nextCursor,
      total: totalCount,
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
    const validUntil = offsetIsoDateInTimeZone(new Date(), 14);

    const estimateNumber = formatEstimateNumber((estimateCountRes.count ?? 0) + 1);
    const availableLocations = await loadAccessibleSellerLocations(db as any, claims.tenant_id, claims);
    const locationId = resolveDefaultSellerLocationId(claims, availableLocations);
    if (!locationId) {
      return NextResponse.json({ error: 'No accessible location available for this user' }, { status: 400 });
    }
    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('estimates')
      .insert({
        tenant_id: claims.tenant_id,
        location_id: locationId,
        buyer_id: null,
        estimate_number: estimateNumber,
        status: 'draft',
        source: 'seller',
        subtotal: 0,
        tax_amount: 0,
        total_amount: 0,
        estimate_date: today,
        valid_until: validUntil,
        expires_at: `${validUntil}T23:59:59.000Z`,
        buyer_po_ref: null,
        place_of_supply: '',
        notes: null,
        discount_flat: 0,
        freight: 0,
        round_off: 0,
        created_by: claims.sub,
        updated_by: claims.sub,
      })
      .select('id')
      .single();

    if (insertError || !inserted?.id) {
      console.error('[POST /api/tenant/estimates] draft insert error', insertError);
      return NextResponse.json({ error: 'Failed to create estimate draft' }, { status: 500 });
    }

    const composerDoc = await loadEstimateDocument(supabaseAdmin as DbClient, claims.tenant_id, inserted.id, claims.role ?? null, claims);
    if (!composerDoc || composerDoc === 'forbidden') {
      return NextResponse.json({ error: 'Draft created but could not be loaded' }, { status: 500 });
    }
    return NextResponse.json({ data: composerDoc.composerPayload });
  } catch (error) {
    console.error('[POST /api/tenant/estimates]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
