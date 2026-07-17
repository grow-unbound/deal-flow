import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { loadAccessibleSellerLocations } from '@/lib/server/seller-location-access';

type DbClient = NonNullable<typeof supabaseAdmin>;

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
type AvatarHue = 'teal' | 'ember' | 'cream';

type ActivityKind = 'invoice' | 'payment' | 'credit_adjustment' | 'catalog_view' | 'order' | 'audit';
type PriceListStatus = 'active' | 'draft' | 'expired';
type BuyerSnapshotRow = {
  buyer_id: string;
  is_active: boolean | null;
  is_dormant: boolean | null;
  outstanding_dues: number | null;
  overdue_amount: number | null;
  credit_limit: number | null;
  last_order_at: string | null;
  last_activity_at: string | null;
};
type BuyerKpiRow = {
  buyer_id: string;
  estimates_count: number | null;
  orders_count: number | null;
  invoices_count: number | null;
  orders_gmv: number | null;
};

type BuyerTrendKpiRow = {
  day: string;
  orders_gmv: number | null;
};

function getIstMonthBounds(now = new Date()) {
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const year = istNow.getFullYear();
  const month = istNow.getMonth();

  const mtdStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  const prevMonthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const prevMonthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  return {
    mtdStartIso: mtdStart.toISOString(),
    nextMonthStartIso: nextMonthStart.toISOString(),
    prevMonthStartIso: prevMonthStart.toISOString(),
    prevMonthEndIso: prevMonthEnd.toISOString(),
  };
}

function getIstTrailingMonthKeys(count: number, now = new Date()) {
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const rows: Array<{ key: string; label: string }> = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(istNow.getFullYear(), istNow.getMonth() - offset, 1, 0, 0, 0));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    rows.push({
      key,
      label: date.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
    });
  }

  return rows;
}

function getIstYearStartIso(now = new Date()) {
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const start = new Date(Date.UTC(istNow.getFullYear(), 0, 1, 0, 0, 0));
  return start.toISOString();
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function pickHue(seed: string): AvatarHue {
  const n = seed.charCodeAt(0) || 0;
  if (n % 3 === 0) return 'teal';
  if (n % 3 === 1) return 'ember';
  return 'cream';
}

function toRelativeDaysLabel(value: string | null): string {
  if (!value) return '—';
  const diffMs = Date.now() - new Date(value).getTime();
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  return `${days}d ago`;
}

function safePct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function growthPct(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round((((current - previous) / previous) * 100) * 10) / 10;
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function maxIso(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function shortDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function yearsLoyalLabel(createdAt: string | null): string {
  if (!createdAt) return '0 yrs loyal';
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const years = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25)));
  return `${years} yrs loyal`;
}

function derivePriceListStatus(validFrom: string | null, validTo: string | null, isActive: boolean): PriceListStatus {
  const now = Date.now();
  const fromTs = validFrom ? new Date(validFrom).getTime() : Number.NEGATIVE_INFINITY;
  const toTs = validTo ? new Date(validTo).getTime() : Number.POSITIVE_INFINITY;
  if (toTs < now) return 'expired';
  if (!isActive) return 'draft';
  if (fromTs > now) return 'draft';
  return 'active';
}

function isRecoverableOptionalError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST205' || // relation not found
    error.code === '42P01' || // table does not exist
    error.code === '42703' || // column does not exist
    message.includes('does not exist') ||
    message.includes('not found')
  );
}

function isVisibleOrderTransaction(order: { status: string }) {
  return order.status !== 'draft' && order.status !== 'cancelled';
}

function isVisibleEstimateTransaction(estimate: { status: string }) {
  return estimate.status !== 'pending' && estimate.status !== 'void';
}

function isVisibleInvoiceTransaction(invoice: { status: string }) {
  return invoice.status !== 'draft' && invoice.status !== 'void';
}

async function optionalSelect(
  db: any,
  table: string,
  select: string,
  tenantId: string,
  buyerId: string,
) {
  const res = await db
    .schema('app')
    .from(table)
    .select(select)
    .eq('tenant_id', tenantId)
    .eq('buyer_id', buyerId)
    .is('deleted_at', null);

  // Optional activity sources should never fail the page.
  // Some pilot environments may not have these tables/columns yet.
  if (res.error) {
    console.warn(`[GET /api/tenant/customers/[id]] optional source unavailable: ${table}`, {
      code: res.error.code,
      message: res.error.message,
    });
    return [];
  }

  return res.data ?? [];
}

function scopeByAccessibleLocations(query: any, claims: { role: string | null; location_ids: string[] | null }) {
  const locationIds = claims.role === 'seller_assistant' ? (claims.location_ids ?? []).filter(Boolean) : [];
  if (locationIds.length === 0) return query;
  return query.in('location_id', locationIds);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const claims = await getVerifiedClaims(request);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const flagEnabled = await getFlag('df_customer_master', claims.tenant_id);
    if (!flagEnabled) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as DbClient as any;
    const tenantId = claims.tenant_id;

    const { data: buyer, error: buyerError } = await db
      .schema('app')
      .from('buyers')
      .select('id, tenant_id, business_name, contact_name, phone, email, gstin, gst_treatment, status, billing_address, shipping_address, is_active, buyer_app_enabled, credit_limit, payment_terms_days, default_cohort_id, geography, created_at, updated_at, whatsapp_opt_out_at')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (buyerError) {
      return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
    }

    if (!buyer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const [detailV2Res, buyerUsersRes, cohortMembersRes] = await Promise.all([
      db.schema('app').rpc('get_seller_customer_detail_v2', {
        p_tenant_id: tenantId,
        p_buyer_id: id,
      }),
      db
        .schema('app')
        .from('buyer_users')
        .select('id, user_id, first_name, last_name, email, phone, designation, department, is_active, created_at')
        .eq('buyer_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      db
        .schema('app')
        .from('cohort_members')
        .select('cohort_id, cohorts(name, deleted_at)')
        .eq('buyer_id', id),
    ]);

    if (detailV2Res.error || buyerUsersRes.error || cohortMembersRes.error) {
      console.error('[GET /api/tenant/customers/[id]] V2 detail failed', detailV2Res.error ?? buyerUsersRes.error ?? cohortMembersRes.error);
      return NextResponse.json({ error: 'Failed to fetch customer detail data' }, { status: 500 });
    }

    const detailV2 = (detailV2Res.data ?? {}) as any;
    const kpiByLabel = new Map<string, any>((detailV2.kpi_grid ?? []).map((item: any) => [String(item.label), item.value]));
    const invoiceValue90d = Number(kpiByLabel.get('Invoiced sales 90D') ?? 0);
    const invoiceCount90d = Number(kpiByLabel.get('Invoices 90D') ?? 0);
    const receivable = Number(kpiByLabel.get('Receivable') ?? 0);
    const overdue = Number(kpiByLabel.get('Overdue') ?? 0);
    const creditLimit = Number(buyer.credit_limit ?? 0);
    const creditUsedPct = safePct(receivable, creditLimit);
    const contacts = (buyerUsersRes.data ?? []).map((contact: any) => ({
      id: contact.id,
      user_id: contact.user_id ?? null,
      first_name: contact.first_name ?? '',
      last_name: contact.last_name ?? '',
      full_name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Buyer user',
      name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Buyer user',
      phone: contact.phone ?? null,
      email: contact.email ?? null,
      designation: contact.designation ?? null,
      department: contact.department ?? null,
      is_active: Boolean(contact.is_active),
      status: !contact.is_active ? 'Inactive' : contact.user_id ? 'Active' : 'Pending invite',
    }));
    const activeCohorts = (cohortMembersRes.data ?? [])
      .filter((row: any) => !row.cohorts?.deleted_at)
      .map((row: any) => ({ id: row.cohort_id, name: row.cohorts?.name ?? 'Customer group' }));

    const response = {
      detail_v2: detailV2,
      performance_cards: detailV2.performance_cards ?? [],
      header: {
        id: buyer.id,
        buyer_name: buyer.business_name,
        initials: getInitials(buyer.business_name),
        hue: pickHue(buyer.business_name),
        status_label: buyer.is_active ? 'Active' : 'Inactive',
        status_tone: buyer.is_active ? 'success' : 'neutral',
        buyer_app_enabled: Boolean(buyer.buyer_app_enabled),
        whatsapp_opted_out: Boolean(buyer.whatsapp_opt_out_at),
        city: buyer.geography?.city ?? 'Unknown',
        buyer_since: buyer.created_at,
        years_label: yearsLoyalLabel(buyer.created_at),
        net_terms_days: Number(buyer.payment_terms_days ?? 0),
      },
      meta_strip_4: {
        spend_mtd: invoiceValue90d,
        growth_pct: 0,
        orders_mtd: invoiceCount90d,
        aov_mtd: invoiceCount90d > 0 ? invoiceValue90d / invoiceCount90d : 0,
        last_order_label: '—',
        last_order_primary_product_qty: '—',
        credit_used: receivable,
        credit_limit: creditLimit,
        credit_used_pct: creditUsedPct,
      },
      details: {
        business_name: buyer.business_name,
        contact_name: buyer.contact_name,
        phone: buyer.phone,
        email: buyer.email,
        gstin: buyer.gstin,
        gst_treatment: buyer.gst_treatment ?? null,
        city: buyer.geography?.city ?? null,
        state: buyer.geography?.state ?? null,
        pincode: buyer.geography?.pincode ?? null,
        zone: buyer.geography?.zone ?? null,
        billing_address: buyer.billing_address ?? null,
        shipping_address: buyer.shipping_address ?? null,
        payment_terms_days: buyer.payment_terms_days,
        credit_limit: buyer.credit_limit,
        default_price_list_id: null,
        assigned_price_list: null,
        buyer_users: contacts,
        contacts,
        default_cohort_id: buyer.default_cohort_id,
        cohorts: activeCohorts,
        is_active: buyer.is_active,
        buyer_app_enabled: Boolean(buyer.buyer_app_enabled),
      },
      performance: {
        monthly_spend_trend: [],
        order_frequency: [],
        brand_mix: [],
        top_skus: [],
        price_list_summary: [],
      },
      performance_v2: {
        headline: {
          spend_mtd: invoiceValue90d,
          growth_pct: 0,
          orders_mtd: invoiceCount90d,
          aov_mtd: invoiceCount90d > 0 ? invoiceValue90d / invoiceCount90d : 0,
        },
        brand_mix: { rows: [] },
        top_skus: [],
        credit_ops: {
          credit_used: receivable,
          credit_limit: creditLimit,
          credit_util_pct: creditUsedPct,
          last_order_days_ago: '—',
          last_order_value: 0,
          catalog_opens_mtd: 0,
          payment_behavior_summary: overdue > 0 ? 'Payment behavior - overdue invoices present' : 'Payment behavior - current',
        },
      },
      estimates: { rows: [] },
      orders: { rows: [], badge_count_mtd: 0 },
      invoices: { rows: [] },
      cohorts_summary: { rows: activeCohorts },
      price_lists: { assigned: [], coverage: [] },
      activity: [],
      role: claims.role,
    };

    return NextResponse.json(response, { headers: SELLER_CACHE_PERSONAL });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
