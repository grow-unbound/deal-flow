import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';

type DbClient = NonNullable<typeof supabaseAdmin>;

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
type AvatarHue = 'teal' | 'ember' | 'cream';

type ActivityKind = 'invoice' | 'payment' | 'credit_adjustment' | 'catalog_view' | 'order' | 'audit';

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
  const brandProductFlagEnabled = await getFlag('df_brand_product_master', claims.tenant_id);

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const db = supabaseAdmin as DbClient as any;

  const { data: globalBuyer, error: globalBuyerError } = await db
    .schema('app')
    .from('buyers')
    .select('id, tenant_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (globalBuyerError) {
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  }

  if (!globalBuyer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  if (globalBuyer.tenant_id !== claims.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: buyer, error: buyerError } = await db
    .schema('app')
    .from('buyers')
    .select('id, tenant_id, business_name, contact_name, phone, email, gstin, tier, is_active, credit_limit, payment_terms_days, external_ref, geography, created_at, updated_at')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .single();

  if (buyerError || !buyer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  const bounds = getIstMonthBounds();

  const [
    monthOrdersRes,
    prevOrdersRes,
    allOrdersRes,
    cohortMembersRes,
    auditRes,
  ] = await Promise.all([
    db
      .schema('app')
      .from('orders')
      .select('id, order_number, buyer_id, status, total_amount, placed_at, created_at')
      .eq('tenant_id', claims.tenant_id)
      .eq('buyer_id', id)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('placed_at', bounds.mtdStartIso)
      .lt('placed_at', bounds.nextMonthStartIso)
      .order('placed_at', { ascending: false }),
    db
      .schema('app')
      .from('orders')
      .select('id, total_amount, placed_at')
      .eq('tenant_id', claims.tenant_id)
      .eq('buyer_id', id)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('placed_at', bounds.prevMonthStartIso)
      .lt('placed_at', bounds.prevMonthEndIso),
    db
      .schema('app')
      .from('orders')
      .select('id, order_number, buyer_id, status, total_amount, placed_at, created_at, catalog_id')
      .eq('tenant_id', claims.tenant_id)
      .eq('buyer_id', id)
      .is('deleted_at', null)
      .order('placed_at', { ascending: false }),
    db
      .schema('app')
      .from('cohort_members')
      .select('cohort_id, cohorts(name, deleted_at)')
      .eq('buyer_id', id),
    db
      .schema('app')
      .from('audit_log')
      .select('id, ts, action, entity_type, entity_id, diff')
      .eq('tenant_id', claims.tenant_id)
      .order('ts', { ascending: false })
      .limit(250),
  ]);

  if (monthOrdersRes.error || prevOrdersRes.error || allOrdersRes.error || cohortMembersRes.error || auditRes.error) {
    return NextResponse.json({ error: 'Failed to fetch customer detail data' }, { status: 500 });
  }

  const monthOrders = monthOrdersRes.data ?? [];
  const prevOrders = prevOrdersRes.data ?? [];
  const allOrders = allOrdersRes.data ?? [];
  const auditRows = auditRes.data ?? [];

  const orderIds = allOrders.map((order: { id: string }) => order.id);

  const orderItemsRes = orderIds.length
    ? await db
        .schema('app')
        .from('order_items')
        .select('id, order_id, tenant_product_id, qty, line_total, unit_price')
        .in('order_id', orderIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  if (orderItemsRes.error) {
    return NextResponse.json({ error: 'Failed to fetch order items' }, { status: 500 });
  }

  const orderItems = orderItemsRes.data ?? [];
  const tenantProductIds = Array.from(new Set(orderItems.map((item: any) => item.tenant_product_id).filter(Boolean)));

  let tenantProducts: any[] = [];
  if (tenantProductIds.length && brandProductFlagEnabled) {
    const fullRes = await db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id, internal_sku, name_override, master_product_id')
      .in('id', tenantProductIds)
      .is('deleted_at', null);

    if (fullRes.error && isRecoverableOptionalError(fullRes.error)) {
      // Fallback for partial schemas where tenant_brand_id may not exist yet.
      const reducedRes = await db
        .schema('app')
        .from('tenant_products')
        .select('id, internal_sku, name_override, master_product_id')
        .in('id', tenantProductIds)
        .is('deleted_at', null);

      if (reducedRes.error) {
        console.warn('[GET /api/tenant/customers/[id]] tenant_products unavailable; skipping brand/product metadata', {
          code: reducedRes.error.code,
          message: reducedRes.error.message,
        });
      } else {
        tenantProducts = (reducedRes.data ?? []).map((row: any) => ({ ...row, tenant_brand_id: null }));
      }
    } else if (fullRes.error) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    } else {
      tenantProducts = fullRes.data ?? [];
    }
  }

  const tenantProductById = new Map(tenantProducts.map((row: any) => [row.id, row]));
  const masterProductIds = Array.from(new Set(tenantProducts.map((row: any) => row.master_product_id).filter(Boolean)));
  const tenantBrandIds = Array.from(new Set(tenantProducts.map((row: any) => row.tenant_brand_id).filter(Boolean)));

  const [masterProductsRes, tenantBrandsRes] = await Promise.all([
    masterProductIds.length && brandProductFlagEnabled
      ? db.schema('catalog').from('products').select('id, name').in('id', masterProductIds)
      : Promise.resolve({ data: [], error: null }),
    tenantBrandIds.length && brandProductFlagEnabled
      ? db.schema('app').from('tenant_brands').select('id, master_brand_id').in('id', tenantBrandIds).is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (masterProductsRes.error && !isRecoverableOptionalError(masterProductsRes.error)) {
    return NextResponse.json({ error: 'Failed to fetch product/brand metadata' }, { status: 500 });
  }
  if (tenantBrandsRes.error && !isRecoverableOptionalError(tenantBrandsRes.error)) {
    return NextResponse.json({ error: 'Failed to fetch product/brand metadata' }, { status: 500 });
  }

  if (masterProductsRes.error) {
    console.warn('[GET /api/tenant/customers/[id]] master_products unavailable; falling back to tenant SKU/name', {
      code: masterProductsRes.error.code,
      message: masterProductsRes.error.message,
    });
  }
  if (tenantBrandsRes.error) {
    console.warn('[GET /api/tenant/customers/[id]] tenant_brands unavailable; brand affinity will be empty', {
      code: tenantBrandsRes.error.code,
      message: tenantBrandsRes.error.message,
    });
  }

  const tenantBrands = tenantBrandsRes.error ? [] : (tenantBrandsRes.data ?? []);
  const masterBrandIds = Array.from(new Set(tenantBrands.map((row: any) => row.master_brand_id).filter(Boolean)));
  const masterBrandsRes = masterBrandIds.length
    ? await db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds)
    : { data: [], error: null };

  if (masterBrandsRes.error && !isRecoverableOptionalError(masterBrandsRes.error)) {
    return NextResponse.json({ error: 'Failed to fetch brands metadata' }, { status: 500 });
  }
  if (masterBrandsRes.error) {
    console.warn('[GET /api/tenant/customers/[id]] catalog.brands unavailable; brand affinity will be empty', {
      code: masterBrandsRes.error.code,
      message: masterBrandsRes.error.message,
    });
  }

  const masterProductById = new Map<string, string>(((masterProductsRes.error ? [] : masterProductsRes.data) ?? []).map((row: any) => [String(row.id), String(row.name)]));
  const tenantBrandById = new Map<string, string>(tenantBrands.map((row: any) => [String(row.id), String(row.master_brand_id)]));
  const masterBrandById = new Map<string, string>(((masterBrandsRes.error ? [] : masterBrandsRes.data) ?? []).map((row: any) => [String(row.id), String(row.name)]));

  const invoices = await optionalSelect(db, 'invoices', 'id, invoice_date, created_at, status, outstanding_balance, total_amount', claims.tenant_id, id);
  const payments = await optionalSelect(db, 'payments', 'id, paid_at, created_at, amount, status, mode', claims.tenant_id, id);
  const creditNotes = await optionalSelect(db, 'credit_notes', 'id, issued_at, created_at, amount, reason, status', claims.tenant_id, id);
  const catalogViews = await optionalSelect(db, 'catalog_views', 'id, viewed_at, created_at, catalog_id', claims.tenant_id, id);

  const spendMtd = monthOrders.reduce((sum: number, order: any) => sum + Number(order.total_amount ?? 0), 0);
  const prevSpendMtd = prevOrders.reduce((sum: number, order: any) => sum + Number(order.total_amount ?? 0), 0);
  const ordersMtd = monthOrders.length;
  const aovMtd = ordersMtd > 0 ? spendMtd / ordersMtd : 0;

  const latestOrder = allOrders[0] ?? null;

  const itemCountByOrder = new Map<string, number>();
  const lineByOrder = new Map<string, any[]>();
  for (const item of orderItems) {
    const qty = Number(item.qty ?? 0);
    itemCountByOrder.set(item.order_id, (itemCountByOrder.get(item.order_id) ?? 0) + qty);
    const list = lineByOrder.get(item.order_id) ?? [];
    list.push(item);
    lineByOrder.set(item.order_id, list);
  }

  const getPrimaryProductLabel = (orderId: string): string => {
    const items = lineByOrder.get(orderId) ?? [];
    if (!items.length) return '—';

    const top = [...items].sort((a, b) => Number(b.qty ?? 0) - Number(a.qty ?? 0))[0];
    const product = tenantProductById.get(top.tenant_product_id);
    const productName =
      product?.name_override ||
      (product?.master_product_id ? masterProductById.get(product.master_product_id) : null) ||
      product?.internal_sku ||
      'Product';

    return `${productName} ×${Number(top.qty ?? 0)}`;
  };

  const creditUsed = invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.outstanding_balance ?? 0), 0);
  const creditLimit = Number(buyer.credit_limit ?? 0);
  const creditUsedPct = safePct(creditUsed, creditLimit);

  const monthlyMap = new Map<string, number>();
  const freqMap = new Map<string, number>();
  const brandSpendMap = new Map<string, number>();

  for (const order of allOrders) {
    if (order.status === 'cancelled' || !order.placed_at) continue;
    const date = new Date(order.placed_at);
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const dayKey = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + Number(order.total_amount ?? 0));
    freqMap.set(dayKey, (freqMap.get(dayKey) ?? 0) + 1);

    const items = lineByOrder.get(order.id) ?? [];
    for (const item of items) {
      const product = tenantProductById.get(item.tenant_product_id);
      const masterBrandId = product?.tenant_brand_id ? tenantBrandById.get(product.tenant_brand_id) : null;
      const brandName = masterBrandId ? masterBrandById.get(masterBrandId) : null;
      if (!brandName) continue;
      const lineTotal = Number(item.line_total ?? (Number(item.qty ?? 0) * Number(item.unit_price ?? 0)));
      brandSpendMap.set(brandName, (brandSpendMap.get(brandName) ?? 0) + lineTotal);
    }
  }

  const monthlyTrend = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-6)
    .map(([month, spend]) => ({ month, spend }));

  const orderFrequency = Array.from(freqMap.entries())
    .slice(-10)
    .map(([label, orders]) => ({ label, orders }));

  const brandAffinity = Array.from(brandSpendMap.entries())
    .map(([brand, spend]) => ({ brand, spend }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 6);

  const topSkusMap = new Map<string, { name: string; sku: string; revenue: number; units: number }>();
  for (const item of orderItems) {
    const product = tenantProductById.get(item.tenant_product_id);
    const productName =
      product?.name_override ||
      (product?.master_product_id ? masterProductById.get(product.master_product_id) : null) ||
      product?.internal_sku ||
      'Product';
    const sku = product?.internal_sku ?? '—';
    const lineTotal = Number(item.line_total ?? (Number(item.qty ?? 0) * Number(item.unit_price ?? 0)));
    const units = Number(item.qty ?? 0);
    const key = String(item.tenant_product_id ?? sku);
    const current = topSkusMap.get(key) ?? { name: productName, sku, revenue: 0, units: 0 };
    current.revenue += lineTotal;
    current.units += units;
    topSkusMap.set(key, current);
  }

  const topSkus = Array.from(topSkusMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const activeCohorts = (cohortMembersRes.data ?? [])
    .filter((row: any) => row.cohorts?.name && !row.cohorts?.deleted_at)
    .map((row: any) => row.cohorts.name);

  const statusLabel = buyer.is_active ? 'Active' : 'Inactive';
  const statusTone: StatusTone = buyer.is_active ? 'success' : 'neutral';

  const activityEvents: Array<{
    id: string;
    at: string;
    kind: ActivityKind;
    title: string;
    subtitle: string;
    amount?: number;
  }> = [];

  for (const order of allOrders) {
    activityEvents.push({
      id: `order-${order.id}`,
      at: order.placed_at ?? order.created_at ?? new Date().toISOString(),
      kind: 'order',
      title: `Order ${order.order_number ?? order.id.slice(0, 8)} · ${order.status}`,
      subtitle: `${itemCountByOrder.get(order.id) ?? 0} items`,
      amount: Number(order.total_amount ?? 0),
    });
  }

  for (const invoice of invoices) {
    activityEvents.push({
      id: `invoice-${invoice.id}`,
      at: invoice.invoice_date ?? invoice.created_at ?? new Date().toISOString(),
      kind: 'invoice',
      title: `Invoice ${invoice.status ?? 'issued'}`,
      subtitle: `Outstanding ₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(invoice.outstanding_balance ?? 0))}`,
      amount: Number(invoice.total_amount ?? 0),
    });
  }

  for (const payment of payments) {
    activityEvents.push({
      id: `payment-${payment.id}`,
      at: payment.paid_at ?? payment.created_at ?? new Date().toISOString(),
      kind: 'payment',
      title: `Payment ${payment.status ?? 'recorded'}`,
      subtitle: payment.mode ? `via ${payment.mode}` : 'Recorded payment',
      amount: Number(payment.amount ?? 0),
    });
  }

  for (const creditNote of creditNotes) {
    activityEvents.push({
      id: `credit-${creditNote.id}`,
      at: creditNote.issued_at ?? creditNote.created_at ?? new Date().toISOString(),
      kind: 'credit_adjustment',
      title: `Credit adjustment ${creditNote.status ?? ''}`.trim(),
      subtitle: creditNote.reason ?? 'Credit note',
      amount: Number(creditNote.amount ?? 0),
    });
  }

  for (const view of catalogViews) {
    activityEvents.push({
      id: `catalog-view-${view.id}`,
      at: view.viewed_at ?? view.created_at ?? new Date().toISOString(),
      kind: 'catalog_view',
      title: 'Catalog viewed',
      subtitle: `Catalog ${String(view.catalog_id ?? '').slice(0, 8)}`,
    });
  }

  for (const audit of auditRows) {
    if (String(audit.entity_id) !== id && String(audit.entity_type) !== 'buyer') continue;
    activityEvents.push({
      id: `audit-${audit.id}`,
      at: audit.ts,
      kind: 'audit',
      title: `Profile ${audit.action}`,
      subtitle: audit.entity_type,
    });
  }

  activityEvents.sort((a, b) => (a.at > b.at ? -1 : 1));

  const brandMixTotal = brandAffinity.reduce((sum, row) => sum + row.spend, 0);
  const brandMix = brandAffinity.slice(0, 4).map((row) => ({
    brand: row.brand,
    spend: row.spend,
    pct: brandMixTotal > 0 ? Math.round((row.spend / brandMixTotal) * 100) : 0,
  }));

  const catalogOpensMtd = catalogViews.filter((view: any) => {
    const viewedAt = view.viewed_at ?? view.created_at;
    if (!viewedAt) return false;
    return viewedAt >= bounds.mtdStartIso && viewedAt < bounds.nextMonthStartIso;
  }).length;

  const lastOrderValue = latestOrder ? Number(latestOrder.total_amount ?? 0) : 0;
  const issuedInvoiceCount = invoices.length;
  const paidInvoiceCount = invoices.filter((invoice: any) => Number(invoice.outstanding_balance ?? 0) <= 0).length;
  const paymentBehaviorSummary =
    issuedInvoiceCount > 0
      ? `Payment behavior — On time · ${paidInvoiceCount} of ${issuedInvoiceCount} invoices`
      : 'No invoice history yet';

  const response = {
    header: {
      id: buyer.id,
      buyer_name: buyer.business_name,
      initials: getInitials(buyer.business_name),
      hue: pickHue(buyer.business_name),
      status_label: statusLabel,
      status_tone: statusTone,
      tier: buyer.tier,
      city: buyer.geography?.city ?? 'Unknown',
      buyer_since: buyer.created_at,
      years_label: yearsLoyalLabel(buyer.created_at),
      net_terms_days: Number(buyer.payment_terms_days ?? 0),
    },
    meta_strip_4: {
      spend_mtd: spendMtd,
      growth_pct: growthPct(spendMtd, prevSpendMtd),
      orders_mtd: ordersMtd,
      aov_mtd: aovMtd,
      last_order_label: toRelativeDaysLabel(latestOrder?.placed_at ?? null),
      last_order_primary_product_qty: latestOrder ? getPrimaryProductLabel(latestOrder.id) : '—',
      credit_used: creditUsed,
      credit_limit: creditLimit,
      credit_used_pct: creditUsedPct,
    },
    details: {
      business_name: buyer.business_name,
      contact_name: buyer.contact_name,
      phone: buyer.phone,
      email: buyer.email,
      gstin: buyer.gstin,
      city: buyer.geography?.city ?? null,
      state: buyer.geography?.state ?? null,
      pincode: buyer.geography?.pincode ?? null,
      zone: buyer.geography?.zone ?? null,
      payment_terms_days: buyer.payment_terms_days,
      credit_limit: buyer.credit_limit,
      external_ref: buyer.external_ref,
      cohorts: activeCohorts,
      is_active: buyer.is_active,
    },
    performance: {
      monthly_spend_trend: monthlyTrend,
      brand_affinity: brandAffinity,
      order_frequency: orderFrequency,
    },
    performance_v2: {
      headline: {
        spend_mtd: spendMtd,
        growth_pct: growthPct(spendMtd, prevSpendMtd),
        orders_mtd: ordersMtd,
        aov_mtd: aovMtd,
      },
      brand_mix: {
        total_spend: brandMixTotal,
        rows: brandMix,
      },
      top_skus: topSkus,
      credit_ops: {
        last_order_days_ago: toRelativeDaysLabel(latestOrder?.placed_at ?? null),
        last_order_value: lastOrderValue,
        catalog_opens_mtd: catalogOpensMtd,
        credit_used: creditUsed,
        credit_limit: creditLimit,
        credit_util_pct: creditUsedPct,
        payment_behavior_summary: paymentBehaviorSummary,
      },
    },
    orders: {
      badge_count_mtd: ordersMtd,
      rows: allOrders.map((order: any) => ({
        id: order.id,
        order_number: order.order_number,
        placed_at: order.placed_at,
        items: itemCountByOrder.get(order.id) ?? 0,
        gmv: Number(order.total_amount ?? 0),
        status: order.status,
      })),
    },
    activity: activityEvents.slice(0, 100).map((event) => ({
      id: event.id,
      at: event.at,
      kind: event.kind,
      title: event.title,
      subtitle: event.subtitle,
      amount: event.amount ?? null,
    })),
    computed: {
      last_order_date_human: shortDate(latestOrder?.placed_at ?? null),
    },
  };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/tenant/customers/[id]] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
