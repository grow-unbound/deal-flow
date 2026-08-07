import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';

type DbClient = NonNullable<typeof supabaseAdmin>;

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
type AvatarHue = 'teal' | 'ember' | 'cream';
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

function yearsLoyalLabel(createdAt: string | null): string {
  if (!createdAt) return '0 yrs loyal';
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const years = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25)));
  return `${years} yrs loyal`;
}

function formatShortDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const includePerformance = request.nextUrl.searchParams.get('include_performance') !== 'false';

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
      .select(
        'id, tenant_id, business_name, contact_name, phone, email, gstin, gst_treatment, billing_address, shipping_address, is_active, buyer_app_enabled, credit_limit, payment_terms_days, default_cohort_id, geography, created_at, whatsapp_opt_out_at',
      )
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

    const quarterMeta = getSellerLandingPeriodMeta('quarter');
    const currentQuarterStart = quarterMeta.current_start.slice(0, 10);
    const previousQuarterStart = quarterMeta.previous_start.slice(0, 10);

    const [
      detailV2Res,
      buyerUsersRes,
      cohortMembersRes,
      buyerPriceListAssignmentRes,
      buyerNowSummaryRes,
      buyerPeriodSummaryRes,
    ] = await Promise.all([
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
        .from('cohort_members_active')
        .select('cohort_id')
        .eq('buyer_id', id),
      db
        .schema('app')
        .from('price_list_assignments')
        .select('price_list_id')
        .eq('target_type', 'buyer')
        .eq('target_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .schema('app')
        .from('metrics_buyer_now_summary')
        .select('receivable_amount, receivable_invoice_count, overdue_amount, overdue_invoice_count, credit_limit, credit_available')
        .eq('buyer_id', id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle(),
      db
        .schema('app')
        .from('metrics_buyer_period_summary')
        .select(
          'period_start, invoice_value, invoice_count, estimate_value, estimate_count, order_value, order_count, app_demand_value, app_demand_count, primary_demand_count, primary_demand_value',
        )
        .eq('buyer_id', id)
        .eq('tenant_id', tenantId)
        .eq('grain', 'quarter')
        .in('period_start', [currentQuarterStart, previousQuarterStart])
        .is('deleted_at', null),
    ]);

    if (
      detailV2Res.error ||
      buyerUsersRes.error ||
      cohortMembersRes.error ||
      buyerPriceListAssignmentRes.error ||
      buyerNowSummaryRes.error ||
      buyerPeriodSummaryRes.error
    ) {
      console.error(
        '[GET /api/tenant/customers/[id]] bootstrap failed',
        detailV2Res.error ??
          buyerUsersRes.error ??
          cohortMembersRes.error ??
          buyerPriceListAssignmentRes.error ??
          buyerNowSummaryRes.error ??
          buyerPeriodSummaryRes.error,
      );
      return NextResponse.json({ error: 'Failed to fetch customer detail data' }, { status: 500 });
    }

    const nowSummary = (buyerNowSummaryRes.data ?? null) as {
      receivable_amount: number;
      receivable_invoice_count: number;
      overdue_amount: number;
      overdue_invoice_count: number;
      credit_limit: number;
      credit_available: number;
    } | null;
    const periodRows = (buyerPeriodSummaryRes.data ?? []) as Array<{
      period_start: string;
      invoice_value: number;
      invoice_count: number;
      estimate_value: number;
      estimate_count: number;
      order_value: number;
      order_count: number;
      app_demand_value: number;
      app_demand_count: number;
      primary_demand_count: number;
      primary_demand_value: number;
    }>;
    const currentQuarter = periodRows.find((row) => row.period_start === currentQuarterStart) ?? null;
    const previousQuarter = periodRows.find((row) => row.period_start === previousQuarterStart) ?? null;

    function trendPct(current: number, previous: number): number | null {
      if (previous <= 0) return null;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    }

    const detailV2 = (detailV2Res.data ?? {}) as {
      performance_cards?: unknown[];
      summary_metrics?: {
        invoiced_sales_90d?: number | string | null;
        invoice_count_90d?: number | string | null;
        primary_demand_kind?: 'orders' | 'estimates' | 'none' | null;
        primary_demand_value_90d?: number | string | null;
        primary_demand_order_count_90d?: number | string | null;
        primary_demand_estimate_count_90d?: number | string | null;
        receivable_amount?: number | string | null;
        credit_available?: number | string | null;
        credit_limit?: number | string | null;
        last_invoice_value?: number | string | null;
        last_invoice_date?: string | null;
        last_activity_at?: string | null;
        last_activity_kind?: string | null;
      };
      subtitle_meta?: {
        buyer_app_status_label?: string | null;
        last_activity_at?: string | null;
        last_activity_kind?: string | null;
        last_activity_days_ago?: number | null;
      };
      tab_badges?: {
        estimates_90d?: number | string | null;
        orders_90d?: number | string | null;
        invoices_90d?: number | string | null;
        price_lists_assigned?: number | string | null;
      };
      kpi_grid?: Array<{ label?: string; value?: number | string | null }>;
    };

    const kpiByLabel = new Map<string, number>(
      (detailV2.kpi_grid ?? []).map((item) => [String(item.label ?? ''), Number(item.value ?? 0)]),
    );
    const summaryMetrics = detailV2.summary_metrics ?? {};
    const subtitleMeta = detailV2.subtitle_meta ?? {};
    const tabBadges = detailV2.tab_badges ?? {};
    const memberCohortIds = ((cohortMembersRes.data ?? []) as Array<{ cohort_id: string }>).map((row) => row.cohort_id);
    let activeCohorts: Array<{ id: string; name: string }> = [];
    if (memberCohortIds.length > 0) {
      const { data: cohortNameRows } = await db
        .schema('app')
        .from('cohorts')
        .select('id, name')
        .in('id', memberCohortIds)
        .is('deleted_at', null);
      activeCohorts = ((cohortNameRows ?? []) as Array<{ id: string; name: string }>).map((row) => ({
        id: row.id,
        name: row.name ?? 'Customer group',
      }));
    }
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

    const creditLimit = Number(nowSummary?.credit_limit ?? buyer.credit_limit ?? 0);
    const creditUsed = Number(nowSummary?.receivable_amount ?? 0);
    const creditAvailable = Number(nowSummary?.credit_available ?? 0);
    const creditUsedPct = creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 1000) / 10 : 0;
    // Retained for performance_v2 (dead code while showPerformanceTab is false) —
    // meta_strip_4 below is v4-sourced and no longer reads these.
    const invoiceCount90d = Number(summaryMetrics.invoice_count_90d ?? kpiByLabel.get('Invoices 90D') ?? 0);
    const invoicedSales90d = Number(summaryMetrics.invoiced_sales_90d ?? kpiByLabel.get('Invoiced sales 90D') ?? 0);
    const primaryDemandKind = summaryMetrics.primary_demand_kind ?? 'none';

    const defaultPriceListId =
      (buyerPriceListAssignmentRes.data?.price_list_id as string | undefined) ?? null;
    let assignedPriceListName: string | null = null;
    if (defaultPriceListId) {
      const { data: priceList, error: priceListError } = await db
        .schema('app')
        .from('price_lists')
        .select('id, name')
        .eq('id', defaultPriceListId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();

      if (priceListError) {
        console.error('[GET /api/tenant/customers/[id]] failed to load assigned pricelist', priceListError);
        return NextResponse.json({ error: 'Failed to fetch customer detail data' }, { status: 500 });
      }

      assignedPriceListName = (priceList?.name as string | undefined) ?? null;
    }

    const response = {
      detail_v2: includePerformance ? detailV2 : null,
      performance_cards: includePerformance ? (detailV2.performance_cards ?? []) : [],
      header: {
        id: buyer.id,
        buyer_name: buyer.business_name,
        initials: getInitials(buyer.business_name),
        hue: pickHue(buyer.business_name),
        status_label: buyer.is_active ? 'Active' : 'Inactive',
        status_tone: (buyer.is_active ? 'success' : 'neutral') as StatusTone,
        buyer_app_enabled: Boolean(buyer.buyer_app_enabled),
        whatsapp_opted_out: Boolean(buyer.whatsapp_opt_out_at),
        city: buyer.geography?.city ?? 'Unknown',
        buyer_since: buyer.created_at,
        years_label: yearsLoyalLabel(buyer.created_at),
        net_terms_days: Number(buyer.payment_terms_days ?? 0),
        subtitle_meta: {
          buyer_app_status_label:
            subtitleMeta.buyer_app_status_label ??
            (buyer.buyer_app_enabled ? 'Buyer App enabled' : 'Buyer App disabled'),
          city: typeof buyer.geography?.city === 'string' ? buyer.geography.city : null,
          phone: buyer.phone ?? null,
          last_activity_at: subtitleMeta.last_activity_at ?? summaryMetrics.last_activity_at ?? null,
          last_activity_kind: subtitleMeta.last_activity_kind ?? summaryMetrics.last_activity_kind ?? null,
          last_activity_days_ago:
            subtitleMeta.last_activity_days_ago != null
              ? Number(subtitleMeta.last_activity_days_ago)
              : null,
          last_activity_date_label: formatShortDate(
            subtitleMeta.last_activity_at ?? summaryMetrics.last_activity_at ?? null,
          ),
        },
      },
      meta_strip_4: {
        sales_qtd_value: Number(currentQuarter?.invoice_value ?? 0),
        sales_qtd_count: Number(currentQuarter?.invoice_count ?? 0),
        sales_qtd_trend_pct: trendPct(Number(currentQuarter?.invoice_value ?? 0), Number(previousQuarter?.invoice_value ?? 0)),
        receivable_amount: Number(nowSummary?.receivable_amount ?? 0),
        receivable_invoice_count: Number(nowSummary?.receivable_invoice_count ?? 0),
        overdue_amount: Number(nowSummary?.overdue_amount ?? 0),
        overdue_invoice_count: Number(nowSummary?.overdue_invoice_count ?? 0),
        primary_demand_kind: primaryDemandKind,
        demand_qtd_value: Number(currentQuarter?.primary_demand_value ?? 0),
        demand_qtd_count: Number(currentQuarter?.primary_demand_count ?? 0),
        demand_qtd_trend_pct: trendPct(Number(currentQuarter?.primary_demand_value ?? 0), Number(previousQuarter?.primary_demand_value ?? 0)),
        app_engagement_value: Number(currentQuarter?.app_demand_value ?? 0),
        app_engagement_count: Number(currentQuarter?.app_demand_count ?? 0),
        credit_used: creditUsed,
        credit_available: creditAvailable,
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
        default_price_list_id: defaultPriceListId,
        assigned_price_list: assignedPriceListName,
        buyer_users: contacts,
        contacts,
        default_cohort_id: buyer.default_cohort_id,
        cohorts: activeCohorts.map((cohort) => cohort.name),
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
          spend_mtd: invoicedSales90d,
          orders_mtd: invoiceCount90d,
          aov_mtd: invoiceCount90d > 0 ? invoicedSales90d / invoiceCount90d : 0,
        },
        brand_mix: { rows: [] },
        top_skus: [],
        credit_ops: {
          credit_used: creditUsed,
          credit_limit: creditLimit,
          credit_util_pct: creditUsedPct,
          last_order_days_ago:
            subtitleMeta.last_activity_days_ago != null ? `${Number(subtitleMeta.last_activity_days_ago)}d ago` : '—',
          last_order_value: Number(summaryMetrics.last_invoice_value ?? 0),
          catalog_opens_mtd: 0,
          payment_behavior_summary:
            creditUsed > 0 ? 'Payment behavior - current receivables present' : 'Payment behavior - current',
        },
      },
      tab_badges: {
        estimates_90d: Number(tabBadges.estimates_90d ?? 0),
        orders_90d: Number(tabBadges.orders_90d ?? 0),
        invoices_90d: Number(tabBadges.invoices_90d ?? 0),
        price_lists_assigned: Number(tabBadges.price_lists_assigned ?? 0),
      },
      cohorts_summary: {
        rows: activeCohorts.map((cohort) => ({
          id: cohort.id,
          name: cohort.name,
          member_count: 1,
        })),
      },
      price_lists: {
        assigned_count: Number(tabBadges.price_lists_assigned ?? 0),
      },
      role: claims.role,
    };

    return NextResponse.json(response, { headers: SELLER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/tenant/customers/[id]]', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
