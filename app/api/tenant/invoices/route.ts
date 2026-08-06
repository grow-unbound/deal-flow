import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { isoDateInTimeZone, offsetIsoDateInTimeZone } from '@/lib/date-utils';
import { getFlag } from '@/lib/flags';
import { getInAppCreateFlags } from '@/lib/server/seller-features';
import { effectiveInvoiceStatus } from '@/lib/invoice-status';
import { loadInvoiceDocument } from '@/lib/invoices/load-tenant-invoice-composer';
import { getAuthUserDisplayNameMap } from '@/lib/server/auth-user-directory';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import {
  applySellerLocationScope,
  loadAccessibleSellerLocations,
  resolveDefaultSellerLocationId,
} from '@/lib/server/seller-location-access';
import { supabaseAdmin } from '@/lib/supabase';
import { createTimer } from '@/lib/server-timing';
import { PAGE_SIZE, decodeCursor, encodeCursor } from '@/lib/pagination';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { readArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';
import { applyTransactionTableSearch, loadTransactionSearchScopeIds } from '@/lib/server/document-table-search';

type DbClient = any;
import type {
  InvoiceAvatarHue,
  InvoiceFilterChip,
  InvoiceLandingRow,
  InvoiceLinkedDoc,
  InvoiceStatusTone,
  InvoiceStatusValue,
} from '@/types/tenant-invoices';

export const dynamic = 'force-dynamic';

const OVERDUE_STATUSES = ['overdue', 'sent', 'unpaid', 'viewed', 'partially_paid'];

interface InvoiceDbRow {
  id: string;
  location_id: string | null;
  invoice_number: string;
  buyer_id: string;
  order_id: string | null;
  estimate_id: string | null;
  is_buyer_app_invoice: boolean;
  status: string;
  total_amount: number;
  outstanding_balance: number | null;
  invoice_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  place_of_supply: string | null;
  created_by: string | null;
  created_at: string;
}

interface BuyerRow {
  id: string;
  business_name: string;
  geography: Record<string, unknown> | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  source?: string | null;
  campaign_id?: string | null;
}

interface EstimateRow {
  id: string;
  estimate_number: string | null;
  campaign_id?: string | null;
}

interface InvoiceItemRow {
  invoice_id: string;
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

function getHue(index: number): InvoiceAvatarHue {
  if (index % 3 === 0) return 'teal';
  if (index % 3 === 1) return 'ember';
  return 'cream';
}

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function statusPresentation(
  effective: InvoiceStatusValue,
): { label: string; tone: InvoiceStatusTone; filter_chip: InvoiceFilterChip } {
  switch (effective) {
    case 'draft':
      return { label: 'Draft', tone: 'neutral', filter_chip: 'Draft' };
    case 'sent':
      return { label: 'Sent', tone: 'warning', filter_chip: 'Sent' };
    case 'paid':
      return { label: 'Paid', tone: 'success', filter_chip: 'Paid' };
    case 'overdue':
      return { label: 'Overdue', tone: 'danger', filter_chip: 'Overdue' };
    case 'void':
      return { label: 'Void', tone: 'neutral', filter_chip: 'Void' };
    default:
      return { label: effective, tone: 'neutral', filter_chip: 'All' };
  }
}

function buildLinked(
  row: InvoiceDbRow,
  orderById: Map<string, OrderRow>,
  estimateById: Map<string, EstimateRow>,
): InvoiceLinkedDoc {
  if (row.order_id) {
    const o = orderById.get(row.order_id);
    return {
      type: 'order',
      label: o?.order_number ?? '—',
      href: o ? `/sales-orders/${o.id}` : undefined,
    };
  }
  if (row.estimate_id) {
    const e = estimateById.get(row.estimate_id);
    return {
      type: 'estimate',
      label: e?.estimate_number ?? '—',
      href: e ? `/estimates/${e.id}` : undefined,
    };
  }
  return { type: 'direct', label: '—' };
}

function getInvoiceDocumentTimestamp(row: Pick<InvoiceDbRow, 'invoice_date' | 'created_at'>): string {
  return row.invoice_date ?? row.created_at;
}

function applyInvoiceDocumentPeriod<T extends { or: (filter: string) => T }>(query: T, start: string, endExclusive: string): T {
  return query.or(
    `and(invoice_date.gte.${start},invoice_date.lt.${endExclusive}),and(invoice_date.is.null,created_at.gte.${start},created_at.lt.${endExclusive})`,
  );
}

function applyInvoiceCursor<T extends { or: (filter: string) => T }>(query: T, cursor: string): T {
  const { created_at, id } = decodeCursor(cursor);
  return query.or(
    `and(invoice_date.lt.${created_at}),and(invoice_date.eq.${created_at},id.lt.${id}),and(invoice_date.is.null,created_at.lt.${created_at}),and(invoice_date.is.null,created_at.eq.${created_at},id.lt.${id})`,
  );
}

function applyInvoiceSourceFilter<T extends { eq: (column: string, value: unknown) => T; is: (column: string, value: unknown) => T; or: (filter: string) => T }>(
  query: T,
  sourceParams: string[],
): T {
  if (sourceParams.length !== 1) return query;
  const [source] = sourceParams;
  if (source === 'Buyer App') {
    return query.eq('is_buyer_app_invoice', true);
  }
  if (source === 'Direct') {
    return query.eq('is_buyer_app_invoice', false).is('order_id', null).is('estimate_id', null);
  }
  if (source === 'Converted') {
    return query.eq('is_buyer_app_invoice', false).or('order_id.not.is.null,estimate_id.not.is.null');
  }
  return query;
}

function applyInvoiceStatusFilter<T extends { eq: (column: string, value: unknown) => T; in: (column: string, values: string[]) => T; lt: (column: string, value: string) => T; gte: (column: string, value: string) => T }>(
  query: T,
  statusParams: string[],
  todayKey: string,
): T {
  if (statusParams.length !== 1) return query;
  const [status] = statusParams;
  if (status === 'Draft') return query.eq('status', 'draft');
  if (status === 'Paid') return query.eq('status', 'paid');
  if (status === 'Void') return query.eq('status', 'void');
  if (status === 'Sent') return query.in('status', ['sent', 'unpaid', 'viewed', 'partially_paid']).gte('due_date', todayKey);
  if (status === 'Overdue') return query.in('status', ['sent', 'unpaid', 'viewed', 'partially_paid', 'overdue']).lt('due_date', todayKey);
  return query;
}

function applyInvoiceDueFilter<T extends { gt: (column: string, value: number) => T; lt: (column: string, value: string) => T; gte: (column: string, value: string) => T }>(
  query: T,
  dueParams: string[],
  todayKey: string,
): T {
  if (dueParams.length !== 1) return query;
  const [due] = dueParams;
  if (due === 'Outstanding') {
    return query.gt('outstanding_balance', 0);
  }
  if (due === 'Overdue') {
    return query.gt('outstanding_balance', 0).lt('due_date', todayKey);
  }
  if (due === 'Due') {
    return query.gt('outstanding_balance', 0).gte('due_date', todayKey);
  }
  if (due === 'Due in 7 days') {
    return query.gt('outstanding_balance', 0).gte('due_date', todayKey).lt('due_date', offsetIsoDateInTimeZone(new Date(), 8));
  }
  return query;
}

function parseInvoiceFilterPreset(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function dueFiltersFromInvoicePreset(preset: Record<string, unknown> | null): string[] {
  if (!preset) return [];
  if (preset.overdue === true) return ['Overdue'];
  if (Number(preset.due_lte_days ?? 0) > 0) return ['Due in 7 days'];
  if (Number(preset.balance_gt ?? 0) >= 0 && 'balance_gt' in preset) return ['Outstanding'];
  return [];
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    return jsonWithServerTiming(body, timer, 'invoices_api', init, APP_GET_CACHE_CONTROL);
  };

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return timedJson({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, invoicesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.INVOICES, claims.tenant_id),
    ]);
    if (!orderMgmt || !invoicesFlag) {
      return timedJson({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return timedJson({ error: 'Server configuration error' }, { status: 500 });
    }

    const tenantId = claims.tenant_id;
    const { searchParams } = new URL(request.url);
    const period = getSellerLandingPeriodMeta(searchParams.get('period'));

    const db = supabaseAdmin;
    const availableLocations = await loadAccessibleSellerLocations(db as any, claims.tenant_id, claims);

    const reqLimit = parseRowsLimit(searchParams.get('limit'), PAGE_SIZE.SELLER);
    const cursorParam = searchParams.get('cursor');
    const searchParam = searchParams.get('search')?.trim();
    const filterPreset = parseInvoiceFilterPreset(searchParams.get('filter_preset'));
    const sourceParams = readArrayParam(searchParams, 'source');
    const statusParams = readArrayParam(searchParams, 'status');
    const explicitDueParams = readArrayParam(searchParams, 'due');
    const dueParams = explicitDueParams.length > 0 ? explicitDueParams : dueFiltersFromInvoicePreset(filterPreset);
    const locationParams = readArrayParam(searchParams, 'location_id');
    const todayKey = isoDateInTimeZone(new Date());
    const searchScope = searchParam ? await loadTransactionSearchScopeIds(db, tenantId, searchParam) : { buyerIds: [], locationIds: [] };

    const buildBaseInvoiceQuery = () => {
      return applySellerLocationScope(
        db
          .schema('app')
          .from('invoices')
          .select(
            'id, location_id, invoice_number, buyer_id, order_id, estimate_id, is_buyer_app_invoice, status, total_amount, outstanding_balance, invoice_date, due_date, paid_at, place_of_supply, created_by, created_at',
          )
          .eq('tenant_id', tenantId)
          .is('deleted_at', null) as any,
        claims,
      );
    };

    let invoiceListQuery = buildBaseInvoiceQuery();
    invoiceListQuery = applyInvoiceDocumentPeriod(invoiceListQuery, period.current_start, period.current_end_exclusive);
    if (cursorParam) {
      invoiceListQuery = applyInvoiceCursor(invoiceListQuery, cursorParam);
    }
    invoiceListQuery = applyTransactionTableSearch(invoiceListQuery, 'invoice_number', searchParam ?? '', searchScope.buyerIds, searchScope.locationIds);
    if (locationParams.length > 0) {
      invoiceListQuery = invoiceListQuery.in('location_id', locationParams);
    }
    invoiceListQuery = applyInvoiceSourceFilter(invoiceListQuery, sourceParams);
    invoiceListQuery = applyInvoiceStatusFilter(invoiceListQuery, statusParams, todayKey);
    invoiceListQuery = applyInvoiceDueFilter(invoiceListQuery, dueParams, todayKey);
    invoiceListQuery = invoiceListQuery
      .order('invoice_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(reqLimit + 1);

    const invoiceListRes = await invoiceListQuery;

    if (invoiceListRes.error) {
      console.error(
        '[GET /api/tenant/invoices]',
        invoiceListRes.error,
      );
      return timedJson({ error: 'Failed to fetch invoices' }, { status: 500 });
    }

    const allInvoiceRows = (invoiceListRes.data ?? []) as InvoiceDbRow[];
    const calloutLookupRows = allInvoiceRows;

    const linkedOrderIds = Array.from(
      new Set(
        calloutLookupRows
          .map((r) => r.order_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    const linkedEstimateIds = Array.from(
      new Set(
        calloutLookupRows
          .map((r) => r.estimate_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const [{ data: orderRows }, { data: estimateRows }] = await Promise.all([
      linkedOrderIds.length > 0
        ? db.schema('app').from('orders').select('id, order_number, source, campaign_id').in('id', linkedOrderIds).is('deleted_at', null)
        : Promise.resolve({ data: [] as OrderRow[], error: null }),
      linkedEstimateIds.length > 0
        ? db.schema('app').from('estimates').select('id, estimate_number, campaign_id').in('id', linkedEstimateIds).is('deleted_at', null)
        : Promise.resolve({ data: [] as EstimateRow[], error: null }),
    ]);

    // Detect next page and slice to reqLimit
    const hasNextPage = allInvoiceRows.length > reqLimit;
    const pageRows = hasNextPage ? allInvoiceRows.slice(0, reqLimit) : allInvoiceRows;
    const lastRow = pageRows.at(-1);
    const nextCursor = hasNextPage && lastRow
      ? encodeCursor({ created_at: getInvoiceDocumentTimestamp(lastRow), id: lastRow.id })
      : null;

    const pageBuyerIds = Array.from(new Set(calloutLookupRows.map((r) => r.buyer_id)));
    const [{ data: buyerRows }] = await Promise.all([
      pageBuyerIds.length > 0
        ? db.schema('app').from('buyers').select('id, business_name, geography').in('id', pageBuyerIds).is('deleted_at', null)
        : Promise.resolve({ data: [] as BuyerRow[], error: null }),
    ]);

    const buyers = (buyerRows ?? []) as BuyerRow[];
    const orders = (orderRows ?? []) as OrderRow[];
    const estimates = (estimateRows ?? []) as EstimateRow[];
    const buyerById = new Map(buyers.map((b) => [b.id, b]));
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const estimateById = new Map(estimates.map((e) => [e.id, e]));
    const campaignIds = Array.from(
      new Set([
        ...orders.map((o) => o.campaign_id).filter((value): value is string => Boolean(value)),
        ...estimates.map((e) => e.campaign_id).filter((value): value is string => Boolean(value)),
      ]),
    );
    const campaignsRes = campaignIds.length > 0
      ? await db.schema('app').from('campaigns').select('id, name').in('id', campaignIds).is('deleted_at', null)
      : { data: [] as Array<{ id: string; name: string }>, error: null };
    if (campaignsRes.error) {
      return timedJson({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
    const catalogsById = new Map(((campaignsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));

    const locationNameById = new Map(availableLocations.map((location) => [location.id, location.name]));

    const invoiceIds = calloutLookupRows.map((row) => row.id);
    const creatorIds = Array.from(new Set(calloutLookupRows.map((row) => row.created_by).filter((value): value is string => Boolean(value))));

    const [invoiceItemsRes, creatorMap] = await Promise.all([
      invoiceIds.length > 0
        ? db.schema('app').from('invoice_items').select('invoice_id').in('invoice_id', invoiceIds).is('deleted_at', null)
        : Promise.resolve({ data: [] as InvoiceItemRow[], error: null }),
      getAuthUserDisplayNameMap(creatorIds),
    ]);

    if (invoiceItemsRes.error) {
      console.error('[GET /api/tenant/invoices] invoice_items error:', invoiceItemsRes.error);
      return timedJson({ error: 'Failed to fetch invoices' }, { status: 500 });
    }

    const itemsCountByInvoice = new Map<string, number>();
    for (const row of (invoiceItemsRes.data ?? []) as InvoiceItemRow[]) {
      itemsCountByInvoice.set(row.invoice_id, (itemsCountByInvoice.get(row.invoice_id) ?? 0) + 1);
    }

    const toLandingRow = (row: InvoiceDbRow, index: number): InvoiceLandingRow => {
      const buyer = buyerById.get(row.buyer_id);
      const buyerName = buyer?.business_name ?? 'Unknown buyer';
      const buyerCity = toText(buyer?.geography?.city);
      const buyerState = toText(buyer?.geography?.state);
      const effective = effectiveInvoiceStatus({ status: row.status, due_date: row.due_date });
      const meta = statusPresentation(effective);
      const createdByLabel = creatorMap.get(row.created_by ?? '') ?? 'Team member';
      const linked = buildLinked(row, orderById, estimateById);
      const linkedOrder = row.order_id ? orderById.get(row.order_id) : null;
      const convertedLabel = linked.type !== 'direct' && linked.label !== '—' ? linked.label : null;
      const sourceKind = convertedLabel ? 'converted' : row.is_buyer_app_invoice ? 'buyer_app' : 'direct';
      const sourceLabel = convertedLabel ?? (row.is_buyer_app_invoice ? 'BUYER_APP' : '');
      const sourceDetail = convertedLabel && row.is_buyer_app_invoice ? 'BUYER_APP' : '';
      const campaignId = linkedOrder?.campaign_id ?? (row.estimate_id ? estimateById.get(row.estimate_id)?.campaign_id ?? null : null);
      const campaignName = campaignId ? catalogsById.get(campaignId) ?? null : null;
      return {
        id: row.id,
        location_id: row.location_id,
        location_name: row.location_id ? locationNameById.get(row.location_id) ?? null : null,
        invoice_number: row.invoice_number,
        buyer_id: row.buyer_id,
        buyer_name: buyerName,
        place_of_supply: toText(row.place_of_supply) ?? buyerCity ?? buyerState ?? null,
        buyer_city: buyerCity,
        buyer_state: buyerState,
        buyer_initials: getInitials(buyerName),
        buyer_hue: getHue(index),
        order_id: row.order_id,
        estimate_id: row.estimate_id,
        source_kind: sourceKind,
        source_label: sourceLabel,
        source_detail: sourceDetail,
        campaign_name: campaignName,
        created_by_label: createdByLabel,
        items_count: itemsCountByInvoice.get(row.id) ?? 0,
        total_amount: Number(row.total_amount ?? 0),
        outstanding_amount: Number(row.outstanding_balance ?? 0),
        invoice_date: getInvoiceDocumentTimestamp(row),
        due_date: row.due_date,
        paid_at: row.paid_at,
        created_at: row.created_at,
        status: {
          value: effective,
          label: meta.label,
          tone: meta.tone,
          filter_chip: meta.filter_chip,
        },
        linked,
      };
    };
    const landingRows: InvoiceLandingRow[] = pageRows.map((row, index) => toLandingRow(row, index));
    const landingById = new Map(landingRows.map((row) => [row.id, row]));
    void landingById;

    const filters: LandingFilterMeta = {
      groups: [
        {
          key: 'source',
          label: 'Source',
          options: ['Buyer App', 'Direct', 'Converted'].map((value) => ({ value, label: value })),
        },
        {
          key: 'status',
          label: 'Status',
          options: ['Draft', 'Sent', 'Paid', 'Overdue', 'Void'].map((value) => ({ value, label: value })),
        },
        {
          key: 'due',
          label: 'Receivables',
          options: ['Outstanding', 'Overdue', 'Due', 'Due in 7 days'].map((value) => ({ value, label: value })),
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
      invoices: landingRows,
      filters,
      nextCursor,
      total: null,
      as_of: new Date().toISOString(),
      // Invoices' fixed headline ("This month") is calendar-based, not a
      // rolling trailing-day window, so there is no single horizon day count.
      commercial_horizon_days: null,
      table_period: period.selected,
    };

    return timedJson(payload);
  } catch (e) {
    console.error('[GET /api/tenant/invoices]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
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

    const [orderMgmt, invoicesFlag, createFlags] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.INVOICES, claims.tenant_id),
      getInAppCreateFlags(claims.tenant_id),
    ]);
    if (!orderMgmt || !invoicesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }
    if (!createFlags.create_invoices) {
      return NextResponse.json({ error: 'Invoice creation is disabled for this tenant' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as DbClient;
    const today = isoDateInTimeZone(new Date());

    const { data: invoiceNumberRow } = await db
      .schema('app')
      .from('invoices')
      .select('invoice_number')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastNum = (() => {
      const raw = (invoiceNumberRow?.invoice_number as string | null | undefined) ?? '';
      const match = raw.match(/(\d+)$/);
      return match ? Number(match[1]) : 0;
    })();
    const nextNum = String(lastNum + 1).padStart(4, '0');
    const invoice_number = `INV-${nextNum}`;
    const availableLocations = await loadAccessibleSellerLocations(db as any, claims.tenant_id, claims);
    const locationId = resolveDefaultSellerLocationId(claims, availableLocations);
    if (!locationId) {
      return NextResponse.json({ error: 'No accessible location available for this user' }, { status: 400 });
    }

    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('invoices')
      .insert({
        tenant_id: claims.tenant_id,
        location_id: locationId,
        invoice_number,
        status: 'draft',
        invoice_date: today,
        subtotal: 0,
        tax_amount: 0,
        total_amount: 0,
        outstanding_balance: 0,
        amount_paid: 0,
        discount_flat: 0,
        freight: 0,
        round_off: 0,
        created_by: claims.sub,
        updated_by: claims.sub,
      })
      .select('id')
      .single();

    if (insertError || !inserted?.id) {
      console.error('[POST /api/tenant/invoices] draft insert error', insertError);
      return NextResponse.json({ error: 'Failed to create invoice draft' }, { status: 500 });
    }

    const result = await loadInvoiceDocument(db, claims.tenant_id, inserted.id, claims.role ?? null, claims);
    if (!result || result === 'forbidden') {
      return NextResponse.json({ error: 'Draft created but could not be loaded' }, { status: 500 });
    }
    return NextResponse.json({ data: result.composerPayload });
  } catch (error) {
    console.error('[POST /api/tenant/invoices]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
