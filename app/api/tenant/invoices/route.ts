import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
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

type DbClient = any;
import type {
  InvoiceAvatarHue,
  InvoiceFilterChip,
  InvoiceLandingRow,
  InvoiceLinkedDoc,
  InvoiceTopRiserRow,
  InvoiceStatusTone,
  InvoiceStatusValue,
  InvoicesKpis,
  InvoicesTodaysRead,
  TenantInvoicesResponse,
} from '@/types/tenant-invoices';

export const dynamic = 'force-dynamic';

interface InvoiceDbRow {
  id: string;
  location_id: string | null;
  invoice_number: string;
  buyer_id: string;
  order_id: string | null;
  estimate_id: string | null;
  status: string;
  total_amount: number;
  outstanding_balance: number | null;
  invoice_date: string;
  due_date: string | null;
  paid_at: string | null;
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
}

interface EstimateRow {
  id: string;
  estimate_number: string | null;
}

interface InvoiceItemRow {
  invoice_id: string;
}

function inPeriod(iso: string, startIso: string, endExclusiveIso: string): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(startIso).getTime() && t < new Date(endExclusiveIso).getTime();
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

function growthPct(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('invoices_api'));
    return response;
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

    const [{ data: invoiceRows, error: invErr }, { data: buyerRows }, { data: orderRows }, { data: estimateRows }] =
      await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applySellerLocationScope(
          db
            .schema('app')
            .from('invoices')
            .select(
              'id, location_id, invoice_number, buyer_id, order_id, estimate_id, status, total_amount, outstanding_balance, invoice_date, due_date, paid_at, created_by, created_at',
            )
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false }),
          claims,
        ) as any,
        db.schema('app').from('buyers').select('id, business_name, geography').eq('tenant_id', tenantId).is('deleted_at', null),
        db.schema('app').from('orders').select('id, order_number').eq('tenant_id', tenantId).is('deleted_at', null),
        db
          .schema('app')
          .from('estimates')
          .select('id, estimate_number')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null),
      ]);

    if (invErr) {
      console.error('[GET /api/tenant/invoices]', invErr);
      return timedJson({ error: 'Failed to fetch invoices' }, { status: 500 });
    }

    const buyers = (buyerRows ?? []) as BuyerRow[];
    const orders = (orderRows ?? []) as OrderRow[];
    const estimates = (estimateRows ?? []) as EstimateRow[];
    const buyerById = new Map(buyers.map((b) => [b.id, b]));
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const estimateById = new Map(estimates.map((e) => [e.id, e]));

    const all = (invoiceRows ?? []) as InvoiceDbRow[];
    const inCurrent = all.filter((r) => inPeriod(r.invoice_date, period.current_start, period.current_end_exclusive));
    const inPrevious = all.filter((r) => inPeriod(r.invoice_date, period.previous_start, period.previous_end_exclusive));
    const invoiceIds = inCurrent.map((row) => row.id);
    const creatorIds = Array.from(new Set(all.map((row) => row.created_by).filter((value): value is string => Boolean(value))));

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

    const landingRows: InvoiceLandingRow[] = inCurrent.map((row, index) => {
      const buyer = buyerById.get(row.buyer_id);
      const buyerName = buyer?.business_name ?? 'Unknown buyer';
      const buyerCity = toText(buyer?.geography?.city);
      const buyerState = toText(buyer?.geography?.state);
      const effective = effectiveInvoiceStatus({ status: row.status, due_date: row.due_date });
      const meta = statusPresentation(effective);
      const createdByLabel = creatorMap.get(row.created_by ?? '') ?? 'Team member';
      const linked = buildLinked(row, orderById, estimateById);
      const sourceLabel = linked.type === 'direct' ? 'seller_app' : linked.label;
      const sourceDetail = linked.type === 'direct' ? `Created by ${createdByLabel}` : `Converted by ${createdByLabel}`;
      return {
        id: row.id,
        invoice_number: row.invoice_number,
        buyer_id: row.buyer_id,
        buyer_name: buyerName,
        buyer_city: buyerCity,
        buyer_state: buyerState,
        buyer_initials: getInitials(buyerName),
        buyer_hue: getHue(index),
        order_id: row.order_id,
        estimate_id: row.estimate_id,
        source_label: sourceLabel,
        source_detail: sourceDetail,
        created_by_label: createdByLabel,
        items_count: itemsCountByInvoice.get(row.id) ?? 0,
        total_amount: Number(row.total_amount ?? 0),
        outstanding_amount: Number(row.outstanding_balance ?? 0),
        invoice_date: row.invoice_date,
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
    });

    const invoicesThisPeriod = landingRows.length;
    const invoicesPrevPeriod = inPrevious.length;
    const gmvThisPeriod = landingRows
      .filter((row) => row.status.value !== 'draft' && row.status.value !== 'void')
      .reduce((sum, row) => sum + row.total_amount, 0);
    const gmvPrevPeriod = inPrevious
      .map((row) => ({
        total_amount: Number(row.total_amount ?? 0),
        effective: effectiveInvoiceStatus({ status: row.status, due_date: row.due_date }),
      }))
      .filter((row) => row.effective !== 'draft' && row.effective !== 'void')
      .reduce((sum, row) => sum + row.total_amount, 0);
    const aov = invoicesThisPeriod > 0 ? gmvThisPeriod / invoicesThisPeriod : 0;
    const overdueRows = landingRows.filter((row) => row.status.value === 'overdue');
    const outstandingRows = landingRows.filter((row) => row.outstanding_amount > 0 && row.status.value !== 'void');
    const overdueCount = overdueRows.length;
    const overdueSum = overdueRows.reduce((sum, row) => sum + row.outstanding_amount, 0);
    const outstandingCount = outstandingRows.length;
    const outstandingSum = outstandingRows.reduce((sum, row) => sum + row.outstanding_amount, 0);

    const kpis: InvoicesKpis = {
      invoices_this_period: invoicesThisPeriod,
      invoices_prev_period: invoicesPrevPeriod,
      invoices_growth_pct: growthPct(invoicesThisPeriod, invoicesPrevPeriod),
      gmv_this_period: gmvThisPeriod,
      gmv_prev_period: gmvPrevPeriod,
      aov,
      overdue_count: overdueCount,
      overdue_sum: overdueSum,
      outstanding_count: outstandingCount,
      outstanding_sum: outstandingSum,
    };

    const needsAttention = [...landingRows]
      .filter((row) => row.outstanding_amount > 0 && (row.status.value === 'overdue' || row.status.value === 'sent'))
      .sort((a, b) => {
        if (a.status.value === 'overdue' && b.status.value !== 'overdue') return -1;
        if (a.status.value !== 'overdue' && b.status.value === 'overdue') return 1;
        const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;
        return b.outstanding_amount - a.outstanding_amount;
      })
      .slice(0, 3)
      .map((row) => ({
        id: row.id,
        invoice_number: row.invoice_number,
        buyer_id: row.buyer_id,
        buyer_name: row.buyer_name,
        buyer_initials: row.buyer_initials,
        buyer_hue: row.buyer_hue,
        buyer_city: row.buyer_city,
        buyer_state: row.buyer_state,
        items_count: row.items_count,
        total_amount: row.total_amount,
        outstanding_amount: row.outstanding_amount,
        due_date: row.due_date,
        paid_at: row.paid_at,
        invoice_date: row.invoice_date,
        effective: row.status.value,
      }));

    const topSpenders = [...landingRows]
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, 3)
      .map((row) => ({
        id: row.id,
        invoice_number: row.invoice_number,
        buyer_id: row.buyer_id,
        buyer_name: row.buyer_name,
        buyer_initials: row.buyer_initials,
        buyer_hue: row.buyer_hue,
        buyer_city: row.buyer_city,
        buyer_state: row.buyer_state,
        items_count: row.items_count,
        total_amount: row.total_amount,
        outstanding_amount: row.outstanding_amount,
        due_date: row.due_date,
        paid_at: row.paid_at,
        invoice_date: row.invoice_date,
        effective: row.status.value,
      }));

    const buyerAggregate = new Map<string, InvoiceTopRiserRow>();
    for (const [index, buyer] of buyers.entries()) {
      const currentGmv = inCurrent
        .filter((row) => row.buyer_id === buyer.id)
        .reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
      const previousGmv = inPrevious
        .filter((row) => row.buyer_id === buyer.id)
        .reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
      const deltaGmv = currentGmv - previousGmv;
      if (deltaGmv <= 0) continue;
      buyerAggregate.set(buyer.id, {
        buyer_id: buyer.id,
        buyer_name: buyer.business_name,
        buyer_initials: getInitials(buyer.business_name),
        buyer_hue: getHue(index),
        buyer_city: toText(buyer.geography?.city),
        buyer_state: toText(buyer.geography?.state),
        current_gmv: currentGmv,
        previous_gmv: previousGmv,
        delta_gmv: deltaGmv,
      });
    }

    const topRisers = [...buyerAggregate.values()].sort((a, b) => b.delta_gmv - a.delta_gmv).slice(0, 3);

    const todays_read: InvoicesTodaysRead = {
      needs_attention: needsAttention,
      top_spenders: topSpenders,
      top_risers: topRisers,
    };

    const payload: TenantInvoicesResponse = {
      period,
      kpis,
      todays_read,
      invoices: landingRows,
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

    const [orderMgmt, invoicesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.INVOICES, claims.tenant_id),
    ]);
    if (!orderMgmt || !invoicesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as DbClient;
    const today = new Date().toISOString().slice(0, 10);

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
