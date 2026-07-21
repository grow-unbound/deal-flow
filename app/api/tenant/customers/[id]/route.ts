import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';

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

    const [detailV2Res, buyerUsersRes, cohortMembersRes, buyerPriceListAssignmentRes] = await Promise.all([
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
    ]);

    if (
      detailV2Res.error ||
      buyerUsersRes.error ||
      cohortMembersRes.error ||
      buyerPriceListAssignmentRes.error
    ) {
      console.error(
        '[GET /api/tenant/customers/[id]] bootstrap failed',
        detailV2Res.error ??
          buyerUsersRes.error ??
          cohortMembersRes.error ??
          buyerPriceListAssignmentRes.error,
      );
      return NextResponse.json({ error: 'Failed to fetch customer detail data' }, { status: 500 });
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
    const activeCohorts: Array<{ id: string; name: string }> = (cohortMembersRes.data ?? [])
      .filter((row: any) => !row.cohorts?.deleted_at)
      .map((row: any) => ({ id: row.cohort_id as string, name: row.cohorts?.name ?? 'Customer group' }));
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

    const creditLimit = Number(summaryMetrics.credit_limit ?? buyer.credit_limit ?? 0);
    const creditUsed = Number(summaryMetrics.receivable_amount ?? kpiByLabel.get('Receivable') ?? 0);
    const creditAvailable = Number(summaryMetrics.credit_available ?? kpiByLabel.get('Credit available') ?? 0);
    const creditUsedPct = creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 1000) / 10 : 0;
    const invoiceCount90d = Number(summaryMetrics.invoice_count_90d ?? kpiByLabel.get('Invoices 90D') ?? 0);
    const invoicedSales90d = Number(summaryMetrics.invoiced_sales_90d ?? kpiByLabel.get('Invoiced sales 90D') ?? 0);
    const primaryDemandKind = summaryMetrics.primary_demand_kind ?? 'none';
    const primaryDemandValue90d = Number(summaryMetrics.primary_demand_value_90d ?? kpiByLabel.get('Demand 90D') ?? 0);
    const demandOrderCount90d = Number(summaryMetrics.primary_demand_order_count_90d ?? 0);
    const demandEstimateCount90d = Number(summaryMetrics.primary_demand_estimate_count_90d ?? 0);

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
      detail_v2: detailV2,
      performance_cards: detailV2.performance_cards ?? [],
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
        invoiced_sales_90d: invoicedSales90d,
        invoice_count_90d: invoiceCount90d,
        primary_demand_kind: primaryDemandKind,
        demand_90d: primaryDemandValue90d,
        demand_order_count_90d: demandOrderCount90d,
        demand_estimate_count_90d: demandEstimateCount90d,
        credit_used: creditUsed,
        credit_available: creditAvailable,
        credit_limit: creditLimit,
        credit_used_pct: creditUsedPct,
        last_invoice_value: Number(summaryMetrics.last_invoice_value ?? 0),
        last_invoice_date: summaryMetrics.last_invoice_date ?? null,
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
          growth_pct: 0,
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
