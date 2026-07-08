import { unstable_cache } from 'next/cache';

import { FEATURE_FLAGS, ROLES } from '@/constants';
import { effectiveInvoiceStatus } from '@/lib/invoice-status';
import { getFlag } from '@/lib/flags';
import type { JWTClaims } from '@/lib/auth';
import { sellerLandingPeriodLabel, type SellerLandingPeriodMeta } from '@/lib/seller-period';
import {
  applySellerLocationScope,
  getSellerLocationScope,
  loadAccessibleSellerLocations,
  locationScopeCacheKey,
} from '@/lib/server/seller-location-access';
import { loadBuyerCreditSnapshots } from '@/lib/server/buyer-credit';
import { getSellerShellFeatureAvailability } from '@/lib/server/seller-features';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  SellerDashboardResponse,
  SellerDashboardMetric,
  SellerDashboardCalloutItem,
  SellerDashboardCalloutRow,
  SellerDashboardFeed,
  SellerDashboardFeedRow,
  SellerDashboardRecentActivityRow,
  SellerDashboardBrandRow,
  SellerDashboardRole,
  SellerDashboardTenantSummary,
} from '@/types/seller-dashboard';

type BuyerRow = {
  id: string;
  business_name: string;
  credit_limit: number | null;
  geography: Record<string, unknown> | null;
};

type OrderRow = {
  id: string;
  location_id: string | null;
  buyer_id: string;
  order_number: string;
  status: string;
  total_amount: number | null;
  placed_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type EstimateRow = {
  id: string;
  location_id: string | null;
  buyer_id: string;
  estimate_number: string | null;
  status: string;
  total_amount: number | null;
  created_at: string;
  updated_at: string | null;
};

type InvoiceRow = {
  id: string;
  location_id: string | null;
  buyer_id: string;
  invoice_number: string;
  status: string;
  total_amount: number | null;
  outstanding_balance: number | null;
  invoice_date: string;
  due_date: string | null;
  created_at: string;
  updated_at: string | null;
};

type CatalogRow = {
  id: string;
  name: string;
  status: string;
  valid_to: string | null;
  updated_at: string | null;
};

type InventoryRow = {
  tenant_product_id: string;
  warehouse_id: string | null;
  qty_available: number | null;
  reorder_point: number | null;
  warehouses?: {
    location_id: string | null;
  } | null;
};

type KpiTenantDailyRow = {
  orders_count: number | null;
  gmv: number | null;
};

type KpiProductDailyRevenueRow = {
  tenant_product_id: string;
  revenue: number | null;
};

type TenantProductBrandRow = {
  id: string;
  tenant_brand_id: string | null;
};

type TenantBrandRow = {
  id: string;
  display_name_override: string | null;
  master_brand_id: string | null;
};

type MasterBrandRow = {
  id: string;
  name: string;
};

type TenantRow = {
  id: string;
  business_name: string;
  subdomain: string | null;
  plan: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function sumNumbers<T>(rows: T[], getter: (row: T) => number) {
  return rows.reduce((total, row) => total + getter(row), 0);
}

function growthDelta(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function hueByIndex(index: number): 'teal' | 'ember' | 'cream' {
  if (index % 3 === 0) return 'teal';
  if (index % 3 === 1) return 'ember';
  return 'cream';
}

function cityFromGeography(geography: Record<string, unknown> | null) {
  const city = geography?.city;
  return typeof city === 'string' && city.trim().length > 0 ? city.trim() : 'Unknown city';
}

function formatTimeAgo(iso: string) {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const deltaHours = Math.max(0, Math.round(deltaMs / (60 * 60 * 1000)));
  if (deltaHours < 1) return 'Just now';
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.round(deltaHours / 24);
  if (deltaDays < 7) return `${deltaDays}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function statusToneForOrder(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'received' || status === 'confirmed' || status === 'partially_dispatched') return 'warning';
  if (status === 'cancelled') return 'danger';
  if (status === 'delivered' || status === 'invoiced' || status === 'partially_invoiced') return 'success';
  return 'neutral';
}

function orderStatusLabel(status: string) {
  if (status === 'partially_dispatched') return 'Partly dispatched';
  if (status === 'partially_invoiced') return 'Partly invoiced';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char: string) => char.toUpperCase());
}

function estimateStatusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'draft' || status === 'sent') return 'warning';
  if (status === 'expired' || status === 'rejected' || status === 'void') return 'danger';
  if (status === 'accepted' || status === 'converted') return 'success';
  return 'neutral';
}

function invoicePresentation(row: Pick<InvoiceRow, 'status' | 'due_date'>) {
  const effective = effectiveInvoiceStatus({ status: row.status, due_date: row.due_date });
  if (effective === 'overdue') return { label: 'Overdue', tone: 'danger' as const };
  if (effective === 'paid') return { label: 'Paid', tone: 'success' as const };
  if (effective === 'sent') return { label: 'Sent', tone: 'warning' as const };
  if (effective === 'void') return { label: 'Void', tone: 'neutral' as const };
  return { label: 'Draft', tone: 'neutral' as const };
}

function inPeriod(iso: string | null, startIso: string, endExclusiveIso: string) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return time >= new Date(startIso).getTime() && time < new Date(endExclusiveIso).getTime();
}

function buildRecentFeedRows<T extends { id: string; buyer_id: string; total_amount: number | null; updated_at: string | null; created_at: string }>(
  rows: T[],
  buyersById: Map<string, BuyerRow>,
  builder: (row: T) => Omit<SellerDashboardFeedRow, 'customer_name' | 'amount' | 'updated_at'>,
): SellerDashboardFeedRow[] {
  return rows.map((row) => {
    const buyer = buyersById.get(row.buyer_id);
    return {
      ...builder(row),
      customer_name: buyer?.business_name ?? 'Unknown buyer',
      amount: Number(row.total_amount ?? 0),
      updated_at: row.updated_at ?? row.created_at,
    };
  });
}

function buildTenantSummary(tenant: TenantRow | null, locationNames: string[]): SellerDashboardTenantSummary {
  return {
    id: tenant?.id ?? '',
    business_name: tenant?.business_name ?? 'Tenant',
    subdomain: tenant?.subdomain ?? null,
    plan: tenant?.plan ?? null,
    location_names: locationNames,
  };
}

async function loadLastSignInAt(userId: string | null) {
  if (!userId || !supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) return null;
    return data.user?.last_sign_in_at ?? null;
  } catch {
    return null;
  }
}

async function fetchBrandRows(
  tenantId: string,
  period: SellerLandingPeriodMeta,
): Promise<SellerDashboardBrandRow[]> {
  if (!supabaseAdmin) return [];

  const db = supabaseAdmin;
  const { data: kpiRows } = await db
    .schema('app')
    .from('kpi_product_daily')
    .select('tenant_product_id, revenue')
    .eq('tenant_id', tenantId)
    .gte('day', period.current_start.slice(0, 10))
    .lt('day', period.current_end_exclusive.slice(0, 10));

  const revenueByProduct = new Map<string, number>();
  for (const row of (kpiRows ?? []) as KpiProductDailyRevenueRow[]) {
    revenueByProduct.set(row.tenant_product_id, (revenueByProduct.get(row.tenant_product_id) ?? 0) + Number(row.revenue ?? 0));
  }

  const topProductIds = Array.from(revenueByProduct.keys()).slice(0, 80);
  if (topProductIds.length === 0) return [];

  const [{ data: tenantProducts }, { data: tenantBrands }] = await Promise.all([
    db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id')
      .eq('tenant_id', tenantId)
      .in('id', topProductIds)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('tenant_brands')
      .select('id, display_name_override, master_brand_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
  ]);

  const masterBrandIds = Array.from(new Set(((tenantBrands ?? []) as TenantBrandRow[]).map((row) => row.master_brand_id).filter(Boolean)));
  const { data: masterBrands } = masterBrandIds.length > 0
    ? await db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds).is('deleted_at', null)
    : { data: [] as MasterBrandRow[] };

  const tenantBrandById = new Map(((tenantBrands ?? []) as TenantBrandRow[]).map((row) => [row.id, row]));
  const masterBrandById = new Map(((masterBrands ?? []) as MasterBrandRow[]).map((row) => [row.id, row.name]));

  const revenueByBrand = new Map<string, number>();
  for (const product of (tenantProducts ?? []) as TenantProductBrandRow[]) {
    const revenue = revenueByProduct.get(product.id) ?? 0;
    const tenantBrand = product.tenant_brand_id ? tenantBrandById.get(product.tenant_brand_id) : null;
    const brandName =
      tenantBrand?.display_name_override
      ?? (tenantBrand?.master_brand_id ? masterBrandById.get(tenantBrand.master_brand_id) : null)
      ?? 'Unknown brand';
    revenueByBrand.set(brandName, (revenueByBrand.get(brandName) ?? 0) + revenue);
  }

  const totalRevenue = sumNumbers(Array.from(revenueByBrand.values()), (value) => value);
  return Array.from(revenueByBrand.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, revenue], index) => ({
      id: `${name}-${index}`,
      initials: formatInitials(name),
      name,
      pct: totalRevenue > 0 ? Math.max(8, Math.round((revenue / totalRevenue) * 100)) : 0,
      trend_label: `${Math.round(totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0)}% share`,
      hue: hueByIndex(index),
    }));
}

async function fetchSellerDashboardData(
  tenantId: string,
  claims: Pick<JWTClaims, 'sub' | 'role' | 'location_ids'>,
  period: SellerLandingPeriodMeta,
): Promise<SellerDashboardResponse> {
  const role = (claims.role === ROLES.SELLER_ASSISTANT ? ROLES.SELLER_ASSISTANT : ROLES.SELLER_ADMIN) as SellerDashboardRole;

  if (!supabaseAdmin) {
    return {
      role,
      period,
      tenant: buildTenantSummary(null, []),
      admin: role === ROLES.SELLER_ADMIN ? { metrics: [], callouts: [], top_brands: [], recent_activity: [] } : undefined,
      assistant: role === ROLES.SELLER_ASSISTANT ? { metrics: [], callouts: [], feeds: [] } : undefined,
    };
  }

  const db: any = supabaseAdmin;
  const [featureAvailability, zohoEnabled, tenantRes, accessibleLocations] = await Promise.all([
    getSellerShellFeatureAvailability(tenantId),
    getFlag(FEATURE_FLAGS.ZOHO_INTEGRATION, tenantId),
    db.schema('app').from('tenants').select('id, business_name, subdomain, plan').eq('id', tenantId).single(),
    loadAccessibleSellerLocations(db, tenantId, claims),
  ]);

  const locationNames = accessibleLocations.map((location) => location.name);
  const tenant = buildTenantSummary((tenantRes.data as TenantRow | null) ?? null, locationNames);
  const scopedLocationIds = accessibleLocations.map((location) => location.id);

  let inventoryQuery = db
    .schema('app')
    .from('tenant_inventory')
    .select('tenant_product_id, warehouse_id, qty_available, reorder_point, warehouses!inner(location_id, tenant_id)')
    .eq('warehouses.tenant_id', tenantId)
    .is('deleted_at', null);

  const scope = getSellerLocationScope(claims);
  if (scope.mode === 'subset') {
    inventoryQuery = inventoryQuery.in('warehouses.location_id', scopedLocationIds);
  } else if (scope.mode === 'none') {
    inventoryQuery = inventoryQuery.eq('warehouse_id', '00000000-0000-0000-0000-000000000000');
  }

  const [buyersRes, catalogsRes, inventoryRes, ordersRes, estimatesRes, invoicesRes, kpiCurrentRes, kpiPreviousRes] = await Promise.all([
    db
      .schema('app')
      .from('buyers')
      .select('id, business_name, credit_limit, geography')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('campaigns')
      .select('id, name, status, valid_to, updated_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    inventoryQuery,
    applySellerLocationScope(
      db
        .schema('app')
        .from('orders')
        .select('id, location_id, buyer_id, order_number, status, total_amount, placed_at, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      claims,
    ),
    applySellerLocationScope(
      db
        .schema('app')
        .from('estimates')
        .select('id, location_id, buyer_id, estimate_number, status, total_amount, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      claims,
    ),
    applySellerLocationScope(
      db
        .schema('app')
        .from('invoices')
        .select('id, location_id, buyer_id, invoice_number, status, total_amount, outstanding_balance, invoice_date, due_date, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      claims,
    ),
    db
      .schema('app')
      .from('kpi_tenant_daily')
      .select('orders_count, gmv')
      .eq('tenant_id', tenantId)
      .gte('day', period.current_start.slice(0, 10))
      .lt('day', period.current_end_exclusive.slice(0, 10)),
    db
      .schema('app')
      .from('kpi_tenant_daily')
      .select('orders_count, gmv')
      .eq('tenant_id', tenantId)
      .gte('day', period.previous_start.slice(0, 10))
      .lt('day', period.previous_end_exclusive.slice(0, 10)),
  ]);

  const buyers = (buyersRes.data ?? []) as BuyerRow[];
  const catalogs = (catalogsRes.data ?? []) as CatalogRow[];
  const inventoryRows = (inventoryRes.data ?? []) as InventoryRow[];
  const orders = (ordersRes.data ?? []) as OrderRow[];
  const estimates = (estimatesRes.data ?? []) as EstimateRow[];
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const kpiCurrentRows = (kpiCurrentRes.data ?? []) as KpiTenantDailyRow[];
  const kpiPreviousRows = (kpiPreviousRes.data ?? []) as KpiTenantDailyRow[];

  const buyersById = new Map(buyers.map((buyer) => [buyer.id, buyer]));
  const lowStockAlerts = inventoryRows.filter((row) => {
    const reorder = Number(row.reorder_point ?? 0);
    const qty = Number(row.qty_available ?? 0);
    return reorder > 0 && qty <= reorder;
  }).length;

  const activeCatalogs = catalogs.filter((catalog) => catalog.status === 'published').length;
  const expiringCatalogs = catalogs.filter((catalog) => {
    if (catalog.status !== 'published' || !catalog.valid_to) return false;
    const daysUntilExpiry = (new Date(catalog.valid_to).getTime() - Date.now()) / DAY_MS;
    return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
  }).length;

  const currentOrders = orders.filter((row) => inPeriod(row.placed_at ?? row.created_at, period.current_start, period.current_end_exclusive));
  const previousOrders = orders.filter((row) => inPeriod(row.placed_at ?? row.created_at, period.previous_start, period.previous_end_exclusive));
  const currentOrdersCount = kpiCurrentRows.length > 0 ? sumNumbers(kpiCurrentRows, (row) => Number(row.orders_count ?? 0)) : currentOrders.length;
  const previousOrdersCount = kpiPreviousRows.length > 0 ? sumNumbers(kpiPreviousRows, (row) => Number(row.orders_count ?? 0)) : previousOrders.length;
  const currentGmv = kpiCurrentRows.length > 0 ? sumNumbers(kpiCurrentRows, (row) => Number(row.gmv ?? 0)) : sumNumbers(currentOrders, (row) => Number(row.total_amount ?? 0));
  const previousGmv = kpiPreviousRows.length > 0 ? sumNumbers(kpiPreviousRows, (row) => Number(row.gmv ?? 0)) : sumNumbers(previousOrders, (row) => Number(row.total_amount ?? 0));

  const allOrdersSorted = [...orders].sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());
  const allEstimatesSorted = [...estimates].sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());
  const allInvoicesSorted = [...invoices].sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());

  if (role === ROLES.SELLER_ADMIN) {
    const topBrands = await fetchBrandRows(tenantId, period);
    const overdueInvoices = invoices.filter((invoice) => invoicePresentation(invoice).label === 'Overdue');
    const adminMetrics: SellerDashboardMetric[] = [
      {
        label: `Orders · ${sellerLandingPeriodLabel(period.selected)}`,
        value: currentOrdersCount,
        delta: currentOrdersCount - previousOrdersCount,
        delta_label: `vs previous ${period.selected === 'today' ? 'day' : period.selected}`,
      },
      {
        label: `GMV · ${sellerLandingPeriodLabel(period.selected)}`,
        value: currentGmv,
        delta: growthDelta(currentGmv, previousGmv),
        delta_label: `vs previous ${period.selected === 'today' ? 'day' : period.selected}`,
        // tone: 'accent',
      },
      {
        label: 'Active catalogs',
        value: activeCatalogs,
        sub: `${expiringCatalogs} expiring in 7 days`,
      },
      {
        label: 'Low-stock alerts',
        value: lowStockAlerts,
        sub: 'Across inventory locations',
        tone: lowStockAlerts > 0 ? 'warn' : undefined,
      },
    ];

    const adminCallouts: SellerDashboardCalloutItem[] = [
      {
        kind: 'info',
        eyebrow: 'Orders pulse',
        hint: `${currentOrders.length} in scope`,
        rows: currentOrders
          .filter((order) => order.status === 'received' || order.status === 'confirmed')
          .slice(0, 3)
          .map((order, index): SellerDashboardCalloutRow => ({
            id: order.id,
            initials: formatInitials(buyersById.get(order.buyer_id)?.business_name ?? 'Buyer'),
            hue: hueByIndex(index),
            name: buyersById.get(order.buyer_id)?.business_name ?? 'Unknown buyer',
            reason: `${orderStatusLabel(order.status)} · ${cityFromGeography(buyersById.get(order.buyer_id)?.geography ?? null)}`,
            trailing: formatTimeAgo(order.updated_at ?? order.created_at),
            href: `/sales-orders/${order.id}`,
          })),
      },
      {
        kind: 'opportunity',
        eyebrow: 'Catalog watch',
        hint: `${expiringCatalogs} expiring`,
        rows: catalogs
          .filter((catalog) => catalog.status === 'published' && catalog.valid_to)
          .sort((a, b) => new Date(a.valid_to ?? '').getTime() - new Date(b.valid_to ?? '').getTime())
          .slice(0, 3)
          .map((catalog, index): SellerDashboardCalloutRow => ({
            id: catalog.id,
            initials: formatInitials(catalog.name),
            hue: hueByIndex(index),
            name: catalog.name,
            reason: catalog.valid_to ? `Valid until ${new Date(catalog.valid_to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : 'No end date',
            trailing: catalog.status === 'published' ? 'Published' : orderStatusLabel(catalog.status),
            href: `/catalogs/${catalog.id}`,
          })),
      },
      {
        kind: 'risk',
        eyebrow: 'Collections',
        hint: `${overdueInvoices.length} overdue`,
        rows: overdueInvoices.slice(0, 3).map((invoice, index): SellerDashboardCalloutRow => ({
          id: invoice.id,
          initials: formatInitials(buyersById.get(invoice.buyer_id)?.business_name ?? 'Buyer'),
          hue: hueByIndex(index),
          name: buyersById.get(invoice.buyer_id)?.business_name ?? 'Unknown buyer',
          reason: `${invoice.invoice_number} overdue`,
          trailing: `₹${Math.round(Number(invoice.outstanding_balance ?? 0)).toLocaleString('en-IN')}`,
          href: `/invoices/${invoice.id}`,
        })),
      },
    ];

    const recentActivity: SellerDashboardRecentActivityRow[] = [
      ...allOrdersSorted.slice(0, 5).map((row) => ({
        id: `order-${row.id}`,
        kind: 'order' as const,
        href: `/sales-orders/${row.id}`,
        document_number: row.order_number,
        customer_name: buyersById.get(row.buyer_id)?.business_name ?? 'Unknown buyer',
        status: { label: orderStatusLabel(row.status), tone: statusToneForOrder(row.status) },
        amount: Number(row.total_amount ?? 0),
        updated_at: row.updated_at ?? row.created_at,
      })),
      ...allEstimatesSorted.slice(0, 5).map((row) => ({
        id: `estimate-${row.id}`,
        kind: 'estimate' as const,
        href: `/estimates/${row.id}`,
        document_number: row.estimate_number ?? 'Draft estimate',
        customer_name: buyersById.get(row.buyer_id)?.business_name ?? 'Unknown buyer',
        status: { label: orderStatusLabel(row.status), tone: estimateStatusTone(row.status) },
        amount: Number(row.total_amount ?? 0),
        updated_at: row.updated_at ?? row.created_at,
      })),
      ...allInvoicesSorted.slice(0, 5).map((row) => {
        const presentation = invoicePresentation(row);
        return {
          id: `invoice-${row.id}`,
          kind: 'invoice' as const,
          href: `/invoices/${row.id}`,
          document_number: row.invoice_number,
          customer_name: buyersById.get(row.buyer_id)?.business_name ?? 'Unknown buyer',
          status: presentation,
          amount: Number(row.total_amount ?? 0),
          updated_at: row.updated_at ?? row.created_at,
        };
      }),
    ]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 8);

    return {
      role,
      period,
      tenant,
      admin: {
        metrics: adminMetrics,
        callouts: adminCallouts,
        top_brands: topBrands,
        recent_activity: recentActivity,
      },
    };
  }

  const lastSignInAt = await loadLastSignInAt(claims.sub ?? null);
  const recentSinceIso = lastSignInAt ?? period.current_start;
  const lowStockFeatureEnabled = zohoEnabled || featureAvailability.tallyExport;

  const lastOrderByBuyer = new Map<string, OrderRow>();
  for (const order of [...orders].sort((a, b) => new Date(b.placed_at ?? b.created_at).getTime() - new Date(a.placed_at ?? a.created_at).getTime())) {
    if (!lastOrderByBuyer.has(order.buyer_id)) {
      lastOrderByBuyer.set(order.buyer_id, order);
    }
  }

  const overdueInvoices = invoices.filter((invoice) => {
    const effective = invoicePresentation(invoice).label === 'Overdue';
    if (!effective || !invoice.due_date) return false;
    return (Date.now() - new Date(invoice.due_date).getTime()) / DAY_MS > 15;
  });

  const creditSnapshots = await loadBuyerCreditSnapshots(supabaseAdmin as any, {
    tenantId,
    buyerIds: buyers.map((buyer) => buyer.id),
    creditLimitByBuyerId: new Map(
      buyers.map((buyer) => [buyer.id, Number(buyer.credit_limit ?? 0)]),
    ),
  });

  const operationalMetrics: SellerDashboardMetric[] = [];
  if (featureAvailability.estimates) {
    operationalMetrics.push({
      label: 'Open estimates',
      value: estimates.filter((estimate) => estimate.status === 'draft' || estimate.status === 'sent').length,
      sub: 'Awaiting customer response',
      href: '/estimates',
    });
  }
  if (featureAvailability.salesOrders) {
    operationalMetrics.push({
      label: 'Orders to confirm',
      value: orders.filter((order) => order.status === 'received').length,
      sub: 'Received and pending confirmation',
      tone: 'warn',
      href: '/sales-orders',
    });
  }
  if (featureAvailability.invoices) {
    operationalMetrics.push({
      label: 'Overdue invoices',
      value: invoices.filter((invoice) => invoicePresentation(invoice).label === 'Overdue').length,
      sub: 'Needs collection follow-up',
      tone: 'warn',
      href: '/invoices',
    });
  }
  if (lowStockFeatureEnabled) {
    operationalMetrics.push({
      label: 'Low-stock alerts',
      value: lowStockAlerts,
      sub: 'Below reorder threshold',
      tone: lowStockAlerts > 0 ? 'warn' : undefined,
      href: '/products',
    });
  }
  if (featureAvailability.customerMaster) {
    const inactiveCount = buyers.filter((buyer) => {
      const lastOrder = lastOrderByBuyer.get(buyer.id);
      if (!lastOrder?.placed_at) return false;
      return (Date.now() - new Date(lastOrder.placed_at).getTime()) / DAY_MS > 30;
    }).length;
    operationalMetrics.push({
      label: 'Inactive customers',
      value: inactiveCount,
      sub: 'No order in 30 days',
      href: '/customers',
    });
  }

  const limitedMetrics = operationalMetrics.slice(0, 4);
  if (limitedMetrics.length === 1) {
    limitedMetrics.push({
      label: 'Assigned locations',
      value: Math.max(1, tenant.location_names.length),
      sub: tenant.location_names.join(', ') || 'Scope enforced from your role',
    });
  } else if (limitedMetrics.length === 0) {
    limitedMetrics.push(
      {
        label: 'Assigned locations',
        value: Math.max(1, tenant.location_names.length),
        sub: tenant.location_names.join(', ') || 'Scope enforced from your role',
      },
      {
        label: 'Active customers',
        value: buyers.length,
        sub: 'Customers visible to your team',
      },
    );
  }

  const needsActionRows = buyers
    .map((buyer) => {
      const creditLimit = Number(buyer.credit_limit ?? 0);
      const dues = creditSnapshots.get(buyer.id)?.outstanding_dues ?? 0;
      const utilization = creditLimit > 0 ? Math.round((dues / creditLimit) * 100) : 0;
      const lastOrder = lastOrderByBuyer.get(buyer.id);
      return {
        buyer,
        dues,
        utilization,
        lastOrder,
      };
    })
    .filter((row) => row.dues > 0 || row.utilization >= 100)
    .sort((a, b) => Math.max(b.dues, b.utilization) - Math.max(a.dues, a.utilization))
    .slice(0, 4)
    .map((row, index): SellerDashboardCalloutRow => ({
      id: row.buyer.id,
      initials: formatInitials(row.buyer.business_name),
      hue: hueByIndex(index),
      name: row.buyer.business_name,
      reason: row.dues > 0
        ? `Overdue ₹${Math.round(row.dues).toLocaleString('en-IN')} · last order ${row.lastOrder?.placed_at ? formatTimeAgo(row.lastOrder.placed_at) : 'never'}`
        : `Credit usage ${row.utilization}% · last order ${row.lastOrder?.placed_at ? formatTimeAgo(row.lastOrder.placed_at) : 'never'}`,
      trailing: row.utilization > 0 ? `${row.utilization}% used` : 'Needs follow-up',
      href: '/customers',
    }));

  const recentActivityRows = [
    ...allOrdersSorted
      .filter((row) => new Date(row.updated_at ?? row.created_at).getTime() >= new Date(recentSinceIso).getTime())
      .map((row, index) => ({
        id: `order-${row.id}`,
        at: row.updated_at ?? row.created_at,
        initials: formatInitials(row.order_number),
        hue: hueByIndex(index),
        name: row.order_number,
        reason: `${buyersById.get(row.buyer_id)?.business_name ?? 'Unknown buyer'} · ${orderStatusLabel(row.status)}`,
        trailing: `₹${Math.round(Number(row.total_amount ?? 0)).toLocaleString('en-IN')}`,
        href: `/sales-orders/${row.id}`,
      })),
    ...allEstimatesSorted
      .filter((row) => new Date(row.updated_at ?? row.created_at).getTime() >= new Date(recentSinceIso).getTime())
      .map((row, index) => ({
        id: `estimate-${row.id}`,
        at: row.updated_at ?? row.created_at,
        initials: formatInitials(row.estimate_number ?? 'EST'),
        hue: hueByIndex(index + 1),
        name: row.estimate_number ?? 'Draft estimate',
        reason: `${buyersById.get(row.buyer_id)?.business_name ?? 'Unknown buyer'} · ${orderStatusLabel(row.status)}`,
        trailing: `₹${Math.round(Number(row.total_amount ?? 0)).toLocaleString('en-IN')}`,
        href: `/estimates/${row.id}`,
      })),
    ...allInvoicesSorted
      .filter((row) => new Date(row.updated_at ?? row.created_at).getTime() >= new Date(recentSinceIso).getTime())
      .map((row, index) => ({
        id: `invoice-${row.id}`,
        at: row.updated_at ?? row.created_at,
        initials: formatInitials(row.invoice_number),
        hue: hueByIndex(index + 2),
        name: row.invoice_number,
        reason: `${buyersById.get(row.buyer_id)?.business_name ?? 'Unknown buyer'} · ${invoicePresentation(row).label}`,
        trailing: `₹${Math.round(Number(row.total_amount ?? 0)).toLocaleString('en-IN')}`,
        href: `/invoices/${row.id}`,
      })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 4)
    .map(({ at: _at, ...row }): SellerDashboardCalloutRow => row);

  const reengageRows = buyers
    .map((buyer) => {
      const lastOrder = lastOrderByBuyer.get(buyer.id);
      return { buyer, lastOrder };
    })
    .filter((row) => row.lastOrder?.placed_at && (Date.now() - new Date(row.lastOrder.placed_at).getTime()) / DAY_MS > 30)
    .slice(0, 4)
    .map((row, index): SellerDashboardCalloutRow => ({
      id: row.buyer.id,
      initials: formatInitials(row.buyer.business_name),
      hue: hueByIndex(index),
      name: row.buyer.business_name,
      reason: `Last order ${new Date(row.lastOrder!.placed_at!).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
      trailing: `₹${Math.round(Number(row.lastOrder?.total_amount ?? 0)).toLocaleString('en-IN')}`,
      href: '/customers',
    }));

  const feeds: SellerDashboardFeed[] = [];
  if (featureAvailability.estimates) {
    feeds.push({
      id: 'estimates',
      title: 'Estimates',
      href: '/estimates',
      empty_label: 'No estimates yet',
      rows: buildRecentFeedRows(
        allEstimatesSorted.slice(0, 5),
        buyersById,
        (row) => ({
          id: row.id,
          href: `/estimates/${row.id}`,
          document_number: row.estimate_number ?? 'Draft estimate',
          status: { label: orderStatusLabel(row.status), tone: estimateStatusTone(row.status) },
        }),
      ),
    });
  }
  if (featureAvailability.salesOrders) {
    feeds.push({
      id: 'sales_orders',
      title: 'Sales Orders',
      href: '/sales-orders',
      empty_label: 'No orders yet',
      rows: buildRecentFeedRows(
        allOrdersSorted.slice(0, 5),
        buyersById,
        (row) => ({
          id: row.id,
          href: `/sales-orders/${row.id}`,
          document_number: row.order_number,
          status: { label: orderStatusLabel(row.status), tone: statusToneForOrder(row.status) },
        }),
      ),
    });
  }
  if (featureAvailability.invoices) {
    feeds.push({
      id: 'invoices',
      title: 'Invoices',
      href: '/invoices',
      empty_label: 'No invoices yet',
      rows: buildRecentFeedRows(
        allInvoicesSorted.slice(0, 5),
        buyersById,
        (row) => ({
          id: row.id,
          href: `/invoices/${row.id}`,
          document_number: row.invoice_number,
          status: invoicePresentation(row),
        }),
      ),
    });
  }

  const assistantCallouts: SellerDashboardCalloutItem[] = [
    {
      kind: 'risk',
      eyebrow: 'Needs action',
      hint: `${overdueInvoices.length} overdue`,
      rows: needsActionRows,
    },
    {
      kind: 'info',
      eyebrow: 'Recent activity',
      hint: lastSignInAt ? 'Since your last sign-in' : 'Since start of current period',
      rows: recentActivityRows,
    },
    {
      kind: 'opportunity',
      eyebrow: 'Re-engage',
      hint: 'Dormant for 30+ days',
      rows: reengageRows,
    },
  ];

  return {
    role,
    period,
    tenant,
    assistant: {
      metrics: limitedMetrics,
      callouts: assistantCallouts,
      feeds,
    },
  };
}

export async function getSellerDashboardData(
  tenantId: string,
  claims: Pick<JWTClaims, 'sub' | 'role' | 'location_ids'>,
  period: SellerLandingPeriodMeta,
) {
  const cacheKey = [
    'seller-dashboard',
    tenantId,
    claims.sub ?? 'anon',
    claims.role ?? 'unknown',
    locationScopeCacheKey(claims),
    period.selected,
    period.current_start.slice(0, 10),
    period.current_end_exclusive.slice(0, 10),
    period.previous_start.slice(0, 10),
    period.previous_end_exclusive.slice(0, 10),
  ];

  return unstable_cache(
    () => fetchSellerDashboardData(tenantId, claims, period),
    cacheKey,
    { revalidate: 30, tags: [`seller-dashboard:${tenantId}`] },
  )();
}
