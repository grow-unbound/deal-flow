import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { readArrayParam } from '@/lib/landing-filter-params';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { parseRowsLimit, SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { applySellerLocationScope, loadAccessibleSellerLocations } from '@/lib/server/seller-location-access';
import {
  mapEstimateDocumentSource,
  mapInvoiceDocumentSource,
  mapOrderDocumentSource,
  resolveInvoiceLinkedLabel,
} from '@/lib/server/tenant-document-source';
import { supabaseAdmin } from '@/lib/supabase';

const ParamsSchema = z.object({ id: z.string().uuid() });
const KindSchema = z.enum(['order', 'estimate', 'invoice']);
const SortSchema = z.enum(['newest', 'oldest', 'amount_desc', 'amount_asc', 'status_asc', 'items_desc', 'expiry_asc', 'outstanding_desc']).catch('newest');
type LinkedOrderRow = { id: string; campaign_id: string | null; order_number: string | null };
const MAX_ITEMS_PER_DOCUMENT = 250;

const CONFIG = {
  order: { table: 'orders', number: 'order_number', date: 'order_date', amount: 'total_amount', items: 'order_items', parent: 'order_id', extra: 'campaign_id, source, is_buyer_app_order, estimate_id' },
  estimate: { table: 'estimates', number: 'estimate_number', date: 'estimate_date', amount: 'total_amount', items: 'estimate_items', parent: 'estimate_id', extra: 'campaign_id, source, expires_at, is_buyer_app_estimate' },
  invoice: { table: 'invoices', number: 'invoice_number', date: 'invoice_date', amount: 'total_amount', items: 'invoice_items', parent: 'invoice_id', extra: 'due_date, outstanding_balance, order_id, estimate_id, is_buyer_app_invoice' },
} as const;

function buildDocumentPeriodFilter(dateColumn: string, currentStart: string, currentEndExclusive: string) {
  return `${dateColumn}.gte.${currentStart},${dateColumn}.lt.${currentEndExclusive},and(${dateColumn}.is.null,created_at.gte.${currentStart},created_at.lt.${currentEndExclusive})`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = ParamsSchema.safeParse(await params);
  const parsedKind = KindSchema.safeParse(request.nextUrl.searchParams.get('kind'));
  const claims = await getVerifiedClaims(request);
  if (!parsedParams.success || !parsedKind.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as any;
  const config = CONFIG[parsedKind.data];
  const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), 50);
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get('offset') ?? 0) || 0);
  const sort = SortSchema.parse(request.nextUrl.searchParams.get('sort'));
  const period = getSellerLandingPeriodMeta(request.nextUrl.searchParams.get('period'));
  const queryText = request.nextUrl.searchParams.get('q')?.trim();
  const statuses = readArrayParam(request.nextUrl.searchParams, 'status');

  const buyer = await db.schema('app').from('buyers').select('id').eq('id', parsedParams.data.id)
    .eq('tenant_id', claims.tenant_id).is('deleted_at', null).maybeSingle();
  if (buyer.error || !buyer.data) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });

  let query = db.schema('app').from(config.table)
    .select(`id, ${config.number}, ${config.date}, created_at, status, ${config.amount}, location_id, place_of_supply, ${config.extra}`, { count: 'exact' })
    .eq('tenant_id', claims.tenant_id).eq('buyer_id', parsedParams.data.id).is('deleted_at', null);
  query = applySellerLocationScope(query, claims);
  query = query.or(buildDocumentPeriodFilter(config.date, period.current_start, period.current_end_exclusive));
  if (queryText) query = query.ilike(config.number, `%${queryText.replace(/[%_\\]/g, '\\$&')}%`);
  if (statuses.length === 1) query = query.eq('status', statuses[0]);
  if (statuses.length > 1) query = query.in('status', statuses);
  if (statuses.length === 0) {
    if (parsedKind.data === 'order') query = query.not('status', 'in', '(draft,cancelled)');
    if (parsedKind.data === 'estimate') query = query.not('status', 'in', '(pending,void)');
    if (parsedKind.data === 'invoice') query = query.not('status', 'in', '(draft,void)');
  }
  const sortColumn =
    sort === 'items_desc'
      ? 'id'
      : sort === 'expiry_asc'
        ? 'expires_at'
        : sort === 'outstanding_desc'
          ? 'outstanding_balance'
          : sort.startsWith('amount')
            ? config.amount
            : sort === 'status_asc'
              ? 'status'
              : config.date;
  const ascending = sort === 'oldest' || sort === 'amount_asc' || sort === 'status_asc';
  const pageResult = await query.order(sortColumn, { ascending, nullsFirst: false }).order('id', { ascending: true }).range(offset, offset + limit - 1);
  if (pageResult.error) {
    console.error('[GET /api/tenant/customers/[id]/documents]', pageResult.error);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }

  const rows = pageResult.data ?? [];
  const ids = rows.map((row: any) => row.id);
  const supplementalRowLimit = Math.max(ids.length, 1);
  const itemRowLimit = Math.max(ids.length * MAX_ITEMS_PER_DOCUMENT, 1);

  const orderEstimateIds = parsedKind.data === 'order'
    ? rows.map((row: any) => row.estimate_id).filter(Boolean)
    : [];
  const invoiceOrderIds = parsedKind.data === 'invoice'
    ? rows.map((row: any) => row.order_id).filter(Boolean)
    : [];
  const invoiceEstimateIds = parsedKind.data === 'invoice'
    ? rows.map((row: any) => row.estimate_id).filter(Boolean)
    : [];

  const [linkedOrdersResult, linkedEstimatesForOrdersResult, linkedEstimatesForInvoicesResult] = await Promise.all([
    parsedKind.data === 'invoice' && invoiceOrderIds.length > 0
      ? db.schema('app').from('orders').select('id, campaign_id, order_number').eq('tenant_id', claims.tenant_id)
        .in('id', invoiceOrderIds).is('deleted_at', null).limit(supplementalRowLimit)
      : Promise.resolve({ data: [] }),
    parsedKind.data === 'order' && orderEstimateIds.length > 0
      ? db.schema('app').from('estimates').select('id, estimate_number').eq('tenant_id', claims.tenant_id)
        .in('id', orderEstimateIds).is('deleted_at', null).limit(supplementalRowLimit)
      : Promise.resolve({ data: [] }),
    parsedKind.data === 'invoice' && invoiceEstimateIds.length > 0
      ? db.schema('app').from('estimates').select('id, estimate_number').eq('tenant_id', claims.tenant_id)
        .in('id', invoiceEstimateIds).is('deleted_at', null).limit(supplementalRowLimit)
      : Promise.resolve({ data: [] }),
  ]);

  const linkedOrders = new Map<string, LinkedOrderRow>(
    ((linkedOrdersResult.data ?? []) as LinkedOrderRow[]).map((row) => [row.id, row]),
  );
  const estimateNumberById = new Map<string, string>(
    ((linkedEstimatesForOrdersResult.data ?? []) as Array<{ id: string; estimate_number: string | null }>)
      .map((row) => [row.id, row.estimate_number ?? '']),
  );
  const invoiceOrderNumberById = new Map<string, string>(
    Array.from(linkedOrders.values()).map((row) => [row.id, row.order_number ?? '']),
  );
  const invoiceEstimateNumberById = new Map<string, string>(
    ((linkedEstimatesForInvoicesResult.data ?? []) as Array<{ id: string; estimate_number: string | null }>)
      .map((row) => [row.id, row.estimate_number ?? '']),
  );
  const campaignIds = rows
    .map((row: any) => row.campaign_id ?? linkedOrders.get(String(row.order_id))?.campaign_id)
    .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
  const [itemsResult, locations, campaignsResult] = await Promise.all([
    ids.length ? db.schema('app').from(config.items).select(`id, ${config.parent}`).in(config.parent, ids).is('deleted_at', null)
      .limit(itemRowLimit) : Promise.resolve({ data: [] }),
    loadAccessibleSellerLocations(db, claims.tenant_id, claims),
    campaignIds.length > 0 ? db.schema('app').from('campaigns').select('id, name').eq('tenant_id', claims.tenant_id)
      .in('id', campaignIds).is('deleted_at', null).limit(supplementalRowLimit) : Promise.resolve({ data: [] }),
  ]);
  const itemCounts = new Map<string, number>();
  for (const item of itemsResult.data ?? []) itemCounts.set(String(item[config.parent]), (itemCounts.get(String(item[config.parent])) ?? 0) + 1);
  const locationNames = new Map(locations.map((row) => [row.id, row.name]));
  const campaignNames = new Map((campaignsResult.data ?? []).map((row: any) => [String(row.id), String(row.name)]));

  return NextResponse.json({
    rows: rows.map((row: any) => {
      const linkedOrder = row.order_id ? linkedOrders.get(String(row.order_id)) : null;
      const campaignId = row.campaign_id ?? linkedOrder?.campaign_id;
      const sourceFields =
        parsedKind.data === 'estimate'
          ? mapEstimateDocumentSource(row)
          : parsedKind.data === 'order'
            ? mapOrderDocumentSource(row, row.estimate_id ? estimateNumberById.get(String(row.estimate_id)) : null)
            : mapInvoiceDocumentSource(
                row,
                resolveInvoiceLinkedLabel(row, invoiceOrderNumberById, invoiceEstimateNumberById),
              );

      return {
        id: row.id,
        number: row[config.number] ?? null,
        placed_at: row[config.date] ?? row.created_at ?? null,
        created_at: row.created_at ?? null,
        expires_at: row.expires_at ?? null,
        due_date: row.due_date ?? null,
        location_name: row.location_id ? locationNames.get(row.location_id) ?? null : null,
        place_of_supply: row.place_of_supply ?? null,
        source_kind: sourceFields.source_kind,
        source_label: sourceFields.source_label,
        source_detail: sourceFields.source_detail,
        is_buyer_app: sourceFields.is_buyer_app,
        campaign_name: campaignId ? campaignNames.get(campaignId) ?? null : null,
        items_count: itemCounts.get(row.id) ?? 0,
        total_amount: Number(row[config.amount] ?? 0),
        outstanding_amount: Number(row.outstanding_balance ?? 0),
        status: row.status,
      };
    }),
    total: Number(pageResult.count ?? 0), limit, offset,
  }, { headers: SELLER_CACHE_PERSONAL });
}
