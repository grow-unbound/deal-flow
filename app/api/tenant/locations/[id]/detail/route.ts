import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { normalizeLocationAssociatedUsers } from '@/lib/location-assignees';
import { createTimer } from '@/lib/server-timing';
import { SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import type { LocationDetailResponse } from '@/hooks/useLocations';

export const dynamic = 'force-dynamic';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getCity(address: unknown): string {
  if (address && typeof address === 'object') {
    const a = address as Record<string, unknown>;
    if (typeof a.city === 'string' && a.city.trim()) return a.city.trim();
  }
  return '';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('location_detail'));
    if (!init?.status || (init.status >= 200 && init.status < 300)) {
      response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    }
    return response;
  };

  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return timedJson({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return timedJson({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as any;
  const tenantId = claims.tenant_id;

  const { data: baseLocation, error: locationError } = await db
    .schema('app')
    .from('locations')
    .select('id, tenant_id, name, address, phone_number, status, associated_users, deleted_at, created_at')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (locationError || !baseLocation) {
    return timedJson({ error: 'Not found' }, { status: 404 });
  }

  const locationQuarterMeta = getSellerLandingPeriodMeta('quarter');
  const locationQuarterStart = locationQuarterMeta.current_start.slice(0, 10);

  const [ordersRes, estimatesRes, invoicesRes, activityRes, locationPeriodRes, locationNowRes, locationMonthlyRes] = await Promise.all([
    db
      .schema('app')
      .from('orders')
      .select('id, order_number, buyer_id, location_id, total_amount, status, source, is_buyer_app_order, campaign_id, estimate_id, place_of_supply, placed_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('location_id', id)
      .not('status', 'in', '("cancelled","draft")')
      .is('deleted_at', null)
      .order('placed_at', { ascending: false })
      .limit(20),
    db
      .schema('app')
      .from('estimates')
      .select('id, estimate_number, buyer_id, location_id, status, source, is_buyer_app_estimate, campaign_id, place_of_supply, total_amount, estimate_date, created_at, expires_at')
      .eq('tenant_id', tenantId)
      .eq('location_id', id)
      .is('deleted_at', null)
      .order('estimate_date', { ascending: false })
      .limit(20),
    db
      .schema('app')
      .from('invoices')
      .select('id, invoice_number, buyer_id, location_id, order_id, estimate_id, is_buyer_app_invoice, outstanding_balance, status, invoice_date, due_date, created_at, created_by, place_of_supply, total_amount')
      .eq('tenant_id', tenantId)
      .eq('location_id', id)
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false })
      .limit(20),
    db
      .schema('app')
      .from('audit_log')
      .select('id, action, entity_type, diff, ts, actor_user_id')
      .eq('tenant_id', tenantId)
      .eq('entity_type', 'location')
      .eq('entity_id', id)
      .order('ts', { ascending: false })
      .limit(20),
    db
      .schema('app')
      .from('metrics_location_period_summary')
      .select('invoice_value, invoice_count, invoice_buyer_count, primary_demand_kind, primary_demand_value, primary_demand_count, primary_demand_buyer_count')
      .eq('location_id', id)
      .eq('tenant_id', tenantId)
      .eq('grain', 'quarter')
      .eq('period_start', locationQuarterStart)
      .is('deleted_at', null)
      .maybeSingle(),
    db
      .schema('app')
      .from('metrics_location_now_summary')
      .select('overdue_amount, overdue_invoice_count, open_estimate_count, open_estimate_value, open_order_count, open_order_value')
      .eq('location_id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle(),
    // Last 12 monthly-grain rows for the gmv_trend chart (LocationPerformanceTab, currently
    // unmounted — showPerformanceTab=false). Rows are populated per dirty-day reconciliation,
    // not a fixed rolling window, so a tenant with no historical backfill may see fewer than
    // 12 points; that's expected, not a bug.
    db
      .schema('app')
      .from('metrics_location_period_summary')
      .select('period_start, invoice_value')
      .eq('location_id', id)
      .eq('tenant_id', tenantId)
      .eq('grain', 'month')
      .is('deleted_at', null)
      .order('period_start', { ascending: true })
      .limit(12),
  ]);

  const firstError =
    ordersRes.error ?? estimatesRes.error ?? invoicesRes.error ?? activityRes.error
    ?? locationPeriodRes.error ?? locationNowRes.error ?? locationMonthlyRes.error;
  if (firstError) {
    console.error('[GET /api/tenant/locations/[id]/detail]', firstError.code, firstError.message);
    return timedJson({ error: 'Failed to fetch location detail data' }, { status: 500 });
  }

  const locationQuarter = (locationPeriodRes.data ?? null) as {
    invoice_value: number;
    invoice_count: number;
    invoice_buyer_count: number;
    primary_demand_kind: 'orders' | 'estimates' | 'none' | null;
    primary_demand_value: number;
    primary_demand_count: number;
    primary_demand_buyer_count: number;
  } | null;
  const locationNow = (locationNowRes.data ?? null) as {
    overdue_amount: number;
    overdue_invoice_count: number;
    open_estimate_count: number;
    open_estimate_value: number;
    open_order_count: number;
    open_order_value: number;
  } | null;

  const invoices = invoicesRes.data ?? [];
  const estimates = estimatesRes.data ?? [];
  const orders = ordersRes.data ?? [];

  const primaryDemandKind = locationQuarter?.primary_demand_kind ?? 'none';

  const monthlyRows = (locationMonthlyRes.data ?? []) as Array<{ period_start: string; invoice_value: number }>;
  const gmvTrend = monthlyRows.map((row) => ({
    week_label: new Date(`${row.period_start}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
    week_start: row.period_start,
    gmv: Number(row.invoice_value ?? 0),
    orders_count: 0,
  }));

  // Open primary demand: open estimate value/count for Estimate-primary tenants, open
  // order value/count for Order-primary tenants — now read directly from
  // metrics_location_now_summary instead of re-querying app.estimates/app.orders.
  const openPrimaryDemandValue = primaryDemandKind === 'estimates'
    ? Number(locationNow?.open_estimate_value ?? 0)
    : primaryDemandKind === 'orders'
      ? Number(locationNow?.open_order_value ?? 0)
      : 0;
  const openPrimaryDemandCount = primaryDemandKind === 'estimates'
    ? Number(locationNow?.open_estimate_count ?? 0)
    : primaryDemandKind === 'orders'
      ? Number(locationNow?.open_order_count ?? 0)
      : 0;

  const response: LocationDetailResponse = {
    id: baseLocation.id,
    name: baseLocation.name,
    city: getCity(baseLocation.address),
    phone_number: typeof baseLocation.phone_number === 'string' ? baseLocation.phone_number : null,
    status: baseLocation.status === 'inactive' ? 'inactive' : 'active',
    initials: getInitials(baseLocation.name),
    is_active: baseLocation.status !== 'inactive',
    associated_users: normalizeLocationAssociatedUsers(baseLocation.associated_users),
    meta_strip: {
      sales_qtd_value: locationQuarter?.invoice_value ?? 0,
      sales_qtd_count: locationQuarter?.invoice_count ?? 0,
      sales_qtd_buyer_count: locationQuarter?.invoice_buyer_count ?? 0,
      demand_qtd_value: locationQuarter?.primary_demand_value ?? 0,
      demand_qtd_count: locationQuarter?.primary_demand_count ?? 0,
      demand_qtd_buyer_count: locationQuarter?.primary_demand_buyer_count ?? 0,
      overdue_amount: locationNow?.overdue_amount ?? 0,
      overdue_invoice_count: locationNow?.overdue_invoice_count ?? 0,
      invoice_count: invoices.length,
      unpaid_invoice_count: invoices.filter((invoice: any) => Number(invoice.outstanding_balance ?? 0) > 0).length,
      total_invoice_count: invoices.length,
      open_estimate_count: estimates.filter((estimate: any) => !['converted', 'expired', 'void'].includes(String(estimate.status))).length,
      total_estimate_count: estimates.length,
      open_primary_demand_kind: primaryDemandKind,
      open_primary_demand_value: openPrimaryDemandValue,
      open_primary_demand_count: openPrimaryDemandCount,
    },
    overview: {
      gmv_trend: gmvTrend,
      inventory_health: {
        active_skus: 0,
        oos_skus: 0,
        low_stock_skus: 0,
        avg_days_cover: null,
      },
      top_buyers: (locationQuarter?.invoice_buyer_count ?? 0) > 0 ? [{
        buyer_id: 'aggregate',
        business_name: 'Purchasing customers',
        city: getCity(baseLocation.address),
        initials: 'PC',
        spend_mtd: locationQuarter?.invoice_value ?? 0,
        outstanding_dues: locationNow?.overdue_amount ?? 0,
      }] : [],
    },
    activity: (activityRes.data ?? []).map((row: any) => ({
      id: row.id,
      action: row.action,
      entity_type: row.entity_type,
      diff: row.diff,
      ts: row.ts,
      actor_name: row.actor_user_id,
    })),
  };

  return timedJson(response);
}
