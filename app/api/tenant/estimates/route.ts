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

function inPeriod(iso: string | null, start: string, endExclusive: string): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(start).getTime() && t < new Date(endExclusive).getTime();
}

function isConvertedStatus(status: string): boolean {
  return status === 'converted' || status === 'invoiced';
}

function estimateAnchor(estimate: { accepted_at: string | null; updated_at?: string | null; created_at: string }): string {
  return estimate.accepted_at ?? estimate.updated_at ?? estimate.created_at;
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

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('estimates_api'));
    return response;
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
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? String(PAGE_SIZE.SELLER)), PAGE_SIZE.MAX);
    const cursorParam = req.nextUrl.searchParams.get('cursor');
    const searchParam = req.nextUrl.searchParams.get('search')?.trim();
    const sourceParams = readArrayParam(req.nextUrl.searchParams, 'source');
    const statusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const locationParams = readArrayParam(req.nextUrl.searchParams, 'location_id');

    let baseEstimatesQuery = db
      .schema('app')
      .from('estimates')
      .select(
        'id, location_id, estimate_number, buyer_id, status, total_amount, created_at, sent_at, accepted_at, expires_at, source, is_buyer_app_estimate, campaign_id, place_of_supply, created_by, updated_at',
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1) as any;

    if (cursorParam) {
      const { created_at, id } = decodeCursor(cursorParam);
      baseEstimatesQuery = baseEstimatesQuery.or(
        `created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`,
      );
    }
    if (searchParam) {
      baseEstimatesQuery = baseEstimatesQuery.ilike('estimate_number', `%${searchParam}%`);
    }
    if (sourceParams.length > 0) {
      // "Buyer App" / "Direct" are keyed off is_buyer_app_estimate (not raw
      // `source`) so Zoho-imported buyer-app estimates (source = 'zoho_import',
      // is_buyer_app_estimate = true from cf_catalog_estimate) still bucket
      // correctly instead of falling outside both filter options.
      const wantsBuyerApp = sourceParams.includes('Buyer App');
      const wantsDirect = sourceParams.includes('Direct');
      if (wantsBuyerApp && !wantsDirect) {
        baseEstimatesQuery = baseEstimatesQuery.eq('is_buyer_app_estimate', true);
      } else if (wantsDirect && !wantsBuyerApp) {
        baseEstimatesQuery = baseEstimatesQuery.eq('is_buyer_app_estimate', false);
      }
    }
    if (statusParams.length > 0) {
      baseEstimatesQuery = baseEstimatesQuery.in('status', estimateStatusesForFilters(statusParams));
    }
    if (locationParams.length > 0) {
      baseEstimatesQuery = baseEstimatesQuery.in('location_id', locationParams);
    }

    const scopedEstimatesQuery = applySellerLocationScope(baseEstimatesQuery, claims);

    const snapshotQuery = db
      .schema('app')
      .from('estimates_snapshot')
      .select('total_count')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const scopedCurrentPeriodQuery = applySellerLocationScope(
      db
        .schema('app')
        .from('estimates')
        .select('status, total_amount, created_at, accepted_at, updated_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('created_at', period.current_start)
        .lt('created_at', period.current_end_exclusive) as any,
      claims,
    );
    const scopedPreviousPeriodQuery = applySellerLocationScope(
      db
        .schema('app')
        .from('estimates')
        .select('status, total_amount, created_at, accepted_at, updated_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('created_at', period.previous_start)
        .lt('created_at', period.previous_end_exclusive) as any,
      claims,
    );
    // Scope the converted query to the current period anchor window only.
    // Without a date bound this would scan all ever-converted estimates.
    const scopedConvertedQuery = applySellerLocationScope(
      db
        .schema('app')
        .from('estimates')
        .select('status, total_amount, created_at, accepted_at, updated_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('status', ['converted', 'invoiced'])
        .gte('updated_at', period.current_start)
        .lte('updated_at', period.current_end_exclusive) as any,
      claims,
    );

    const [estimatesRes, currentPeriodRes, previousPeriodRes, convertedPeriodRes, snapshotRes] = await Promise.all([
      scopedEstimatesQuery,
      scopedCurrentPeriodQuery,
      scopedPreviousPeriodQuery,
      scopedConvertedQuery,
      snapshotQuery,
    ]);

    if (estimatesRes.error || currentPeriodRes.error || previousPeriodRes.error || convertedPeriodRes.error) {
      console.error(
        '[GET /api/tenant/estimates] query error:',
        estimatesRes.error || currentPeriodRes.error || previousPeriodRes.error || convertedPeriodRes.error,
      );
      return timedJson({ error: 'Failed to fetch estimates' }, { status: 500 });
    }

    const allFetched = (estimatesRes.data ?? []) as EstimateDbRow[];
    const hasNextPage = allFetched.length > limit;
    const rawEstimates = hasNextPage ? allFetched.slice(0, limit) : allFetched;
    const lastEstimate = rawEstimates.at(-1);
    const nextCursor = hasNextPage && lastEstimate
      ? encodeCursor({ created_at: lastEstimate.created_at, id: lastEstimate.id })
      : null;
    const totalCount = (snapshotRes.data as { total_count?: number | null } | null)?.total_count ?? null;

    // Scope the buyers lookup to only the buyer IDs referenced by the fetched estimates.
    // Previously this loaded all buyers for the tenant on every request.
    const estimateBuyerIds = Array.from(new Set(rawEstimates.map((e) => e.buyer_id).filter(Boolean)));
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
      new Set(rawEstimates.map((row) => row.campaign_id).filter((value): value is string => Boolean(value))),
    );
    const creatorIds = Array.from(
      new Set(
        rawEstimates
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

    const estimateIds = rawEstimates.map((e) => e.id);
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

    const availableLocations = await loadAccessibleSellerLocations(db as any, claims.tenant_id, claims);
    const locationNameById = new Map(availableLocations.map((location) => [location.id, location.name]));

    const normalized = rawEstimates.map((row, index) => {
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
        created_at: row.created_at,
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
    });

    const openRows = normalized.filter((n) => isOpenStatus(n.norm));
    const openTotal = openRows.length;
    const openDrafts = openRows.filter((n) => n.norm === 'draft').length;
    const openSent = openRows.filter((n) => n.norm === 'sent').length;
    const openAccepted = openRows.filter((n) => n.norm === 'accepted').length;
    const readyToConvert = normalized.filter((n) => n.norm === 'accepted').length;

    const expiringSoon = openRows.filter((n) => {
      if (!n.row.expires_at) return false;
      const ex = new Date(n.row.expires_at).getTime();
      return ex <= expiringCutoff;
    }).length;

    const currentPeriodRows = ((currentPeriodRes.data ?? []) as Array<{
      status: string;
      total_amount: number | string | null;
      created_at: string;
      accepted_at: string | null;
      updated_at?: string | null;
    }>).map((row) => ({
      status: normalizeStatus(row.status),
      total_amount: Number(row.total_amount ?? 0),
      created_at: row.created_at,
      accepted_at: row.accepted_at,
      updated_at: row.updated_at ?? null,
    }));

    const previousPeriodRows = ((previousPeriodRes.data ?? []) as Array<{
      status: string;
      total_amount: number | string | null;
      created_at: string;
      accepted_at: string | null;
      updated_at?: string | null;
    }>).map((row) => ({
      status: normalizeStatus(row.status),
      total_amount: Number(row.total_amount ?? 0),
      created_at: row.created_at,
      accepted_at: row.accepted_at,
      updated_at: row.updated_at ?? null,
    }));

    const convertedPeriodRows = ((convertedPeriodRes.data ?? []) as Array<{
      status: string;
      total_amount: number | string | null;
      created_at: string;
      accepted_at: string | null;
      updated_at?: string | null;
    }>).filter((row) => {
      const anchor = estimateAnchor(row);
      return inPeriod(anchor, period.current_start, period.current_end_exclusive);
    });

    const totalEstimatesThisPeriod = currentPeriodRows.length;
    const totalEstimatesPrevPeriod = previousPeriodRows.length;
    const totalGmvThisPeriod = currentPeriodRows.reduce((sum, row) => sum + row.total_amount, 0);
    const totalGmvPrevPeriod = previousPeriodRows.reduce((sum, row) => sum + row.total_amount, 0);
    const totalEstimatesGrowthPct =
      totalEstimatesPrevPeriod > 0 ? Math.round(((totalEstimatesThisPeriod - totalEstimatesPrevPeriod) / totalEstimatesPrevPeriod) * 100) : 0;
    const aov = totalEstimatesThisPeriod > 0 ? totalGmvThisPeriod / totalEstimatesThisPeriod : 0;
    const openEstimatesThisPeriod = currentPeriodRows.filter((row) => isOpenStatus(row.status)).length;

    const openCreatedThisPeriod = openRows.filter((n) =>
      inPeriod(n.row.created_at, period.current_start, period.current_end_exclusive),
    ).length;

    const buyerAppCreatedThisPeriod = openRows.filter(
      (n) =>
        n.row.is_buyer_app_estimate &&
        inPeriod(n.row.created_at, period.current_start, period.current_end_exclusive),
    ).length;

    const kpis: EstimatesKpis = {
      total_estimates_this_period: totalEstimatesThisPeriod,
      total_estimates_prev_period: totalEstimatesPrevPeriod,
      total_estimates_growth_pct: totalEstimatesGrowthPct,
      total_gmv_this_period: totalGmvThisPeriod,
      total_gmv_prev_period: totalGmvPrevPeriod,
      aov,
      open_estimates_this_period: openEstimatesThisPeriod,
      converted_this_period: convertedPeriodRows.length,
      open_total: openTotal,
      open_drafts: openDrafts,
      open_sent: openSent,
      open_accepted: openAccepted,
      ready_to_convert: readyToConvert,
      expiring_soon: expiringSoon,
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
    const needsFollowUp = normalized
      .filter((n) => {
        if (n.norm !== 'sent') return false;
        if (!n.row.sent_at) return false;
        return new Date(n.row.sent_at).getTime() < threeDaysAgo;
      })
      .sort((a, b) => {
        const ta = a.row.sent_at ? new Date(a.row.sent_at).getTime() : 0;
        const tb = b.row.sent_at ? new Date(b.row.sent_at).getTime() : 0;
        return ta - tb;
      })
      .slice(0, 3)
      .map((n) => toCalloutRow(n.landing));

    const readyCallout = normalized
      .filter((n) => n.norm === 'accepted')
      .sort((a, b) => b.landing.total_amount - a.landing.total_amount)
      .slice(0, 3)
      .map((n) => toCalloutRow(n.landing));

    const expiringCallout = openRows
      .filter((n) => {
        if (!n.row.expires_at) return false;
        const ex = new Date(n.row.expires_at).getTime();
        return ex <= expiringCutoff;
      })
      .sort((a, b) => {
        const ta = a.row.expires_at ? new Date(a.row.expires_at).getTime() : 0;
        const tb = b.row.expires_at ? new Date(b.row.expires_at).getTime() : 0;
        return ta - tb;
      })
      .slice(0, 3)
      .map((n) => toCalloutRow(n.landing));

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
