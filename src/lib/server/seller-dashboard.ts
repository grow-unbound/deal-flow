import { unstable_cache } from 'next/cache';

import { FEATURE_FLAGS, ROLES } from '@/constants';
import { effectiveInvoiceStatus, isInvoiceOverdue } from '@/lib/invoice-status';
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
import { formatNumberValue } from '@/lib/utils';
import type {
  SellerDashboardResponse,
  SellerDashboardMetric,
  SellerDashboardCalloutItem,
  SellerDashboardCalloutRow,
  SellerDashboardFeed,
  SellerDashboardFeedRow,
  SellerDashboardRecentActivityRow,
  SellerDashboardRole,
  SellerDashboardTenantSummary,
  MetricsV2DashboardPortfolio,
  SellerDashboardBusinessFlowMeta,
  SellerDashboardCustomerActivityMeta,
} from '@/types/seller-dashboard';
import type { InvoicesKpis } from '@/types/tenant-invoices';

type BuyerRow = {
  id: string;
  business_name: string;
  credit_limit: number | null;
  geography: Record<string, unknown> | null;
  buyer_app_enabled: boolean | null;
};

type BuyerSnapshotRow = {
  buyer_id: string;
  invoice_count_90d: number | string | null;
  invoice_value_90d: number | string | null;
  app_invoice_value_90d: number | string | null;
};

type OrderRow = {
  id: string;
  location_id: string | null;
  buyer_id: string;
  order_number: string;
  status: string;
  total_amount: number | null;
  order_date: string | null;
  placed_at: string | null;
  created_at: string;
  updated_at: string | null;
  buyers?: {
    business_name: string | null;
  } | Array<{
    business_name: string | null;
  }> | null;
};

type EstimateRow = {
  id: string;
  location_id: string | null;
  buyer_id: string;
  estimate_number: string | null;
  status: string;
  total_amount: number | null;
  estimate_date: string | null;
  created_at: string;
  updated_at: string | null;
  buyers?: {
    business_name: string | null;
  } | Array<{
    business_name: string | null;
  }> | null;
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
  buyers?: {
    business_name: string | null;
  } | Array<{
    business_name: string | null;
  }> | null;
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

function formatTimeAgo(iso: string) {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const deltaHours = Math.max(0, Math.round(deltaMs / (60 * 60 * 1000)));
  if (deltaHours < 1) return 'Just now';
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.round(deltaHours / 24);
  if (deltaDays < 7) return `${deltaDays}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function buyerNameFor(
  row: { buyer_id: string; buyers?: { business_name: string | null } | Array<{ business_name: string | null }> | null },
  buyersById: Map<string, BuyerRow>,
) {
  const joinedBuyer = Array.isArray(row.buyers) ? row.buyers[0] : row.buyers;
  return joinedBuyer?.business_name ?? buyersById.get(row.buyer_id)?.business_name ?? 'Unknown buyer';
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

function estimateStatusLabel(status: string) {
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

function orderEventAt(row: Pick<OrderRow, 'order_date' | 'placed_at' | 'created_at'>) {
  return row.order_date ?? row.placed_at ?? row.created_at;
}

function invoiceEventAt(row: Pick<InvoiceRow, 'invoice_date' | 'created_at'>) {
  return row.invoice_date ?? row.created_at;
}

function buildRecentFeedRows<T extends {
  id: string;
  buyer_id: string;
  total_amount: number | null;
  updated_at: string | null;
  created_at: string;
  buyers?: { business_name: string | null } | Array<{ business_name: string | null }> | null;
}>(
  rows: T[],
  buyersById: Map<string, BuyerRow>,
  builder: (row: T) => Omit<SellerDashboardFeedRow, 'customer_name' | 'amount' | 'updated_at'>,
): SellerDashboardFeedRow[] {
  return rows.map((row) => {
    return {
      ...builder(row),
      customer_name: buyerNameFor(row, buyersById),
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

function normalizeDashboardPortfolio(raw: unknown): MetricsV2DashboardPortfolio | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<MetricsV2DashboardPortfolio>;
  return {
    as_of: typeof data.as_of === 'string' ? data.as_of : new Date().toISOString(),
    commercial_horizon_days: Number(data.commercial_horizon_days ?? 90),
    table_period: null,
    primary_demand_kind: data.primary_demand_kind === 'estimates' || data.primary_demand_kind === 'none' ? data.primary_demand_kind : 'orders',
    calculation_version: Number(data.calculation_version ?? 1),
    source_watermark: typeof data.source_watermark === 'string' ? data.source_watermark : null,
    freshness: typeof data.freshness === 'object' && data.freshness ? data.freshness as Record<string, unknown> : {},
    availability: typeof data.availability === 'object' && data.availability ? data.availability as Record<string, unknown> : {},
    metrics: Array.isArray(data.metrics) ? data.metrics : [],
    actions: Array.isArray(data.actions) ? data.actions : [],
    explore: Array.isArray(data.explore) ? data.explore : [],
  };
}

function portfolioItem(portfolio: MetricsV2DashboardPortfolio | null, section: 'metrics' | 'actions' | 'explore', id: string) {
  return portfolio?.[section]?.find((item) => item.id === id) ?? null;
}

function withDashboardAvailabilityMeta(
  portfolio: MetricsV2DashboardPortfolio | null,
  featureAvailability: Awaited<ReturnType<typeof getSellerShellFeatureAvailability>>,
) {
  if (!portfolio) return portfolio;

  return {
    ...portfolio,
    explore: portfolio.explore.map((item) => {
      if (item.id !== 'business_flow') return item;

      const meta = ((item.meta as SellerDashboardBusinessFlowMeta | undefined) ?? {});
      return {
        ...item,
        meta: {
          ...meta,
          orders_enabled: featureAvailability.salesOrders,
          estimates_enabled: featureAvailability.estimates,
        },
      };
    }),
  };
}

function withInvoiceAlignmentMeta(
  portfolio: MetricsV2DashboardPortfolio | null,
  invoiceKpis: InvoicesKpis,
  overdueCustomerCount: number,
) {
  if (!portfolio) return portfolio;

  return {
    ...portfolio,
    metrics: portfolio.metrics.map((item) => {
      if (item.id !== 'overdue_receivables') return item;
      return {
        ...item,
        value: invoiceKpis.overdue_sum,
        count: invoiceKpis.overdue_count,
      };
    }),
    actions: portfolio.actions.map((item) => {
      if (item.id !== 'collections') return item;
      return {
        ...item,
        value: invoiceKpis.overdue_sum,
        count: invoiceKpis.overdue_count,
      };
    }),
    explore: portfolio.explore.map((item) => {
      if (item.id !== 'customer_activity') return item;
      const meta = ((item.meta as SellerDashboardCustomerActivityMeta | undefined) ?? {});
      return {
        ...item,
        meta: {
          ...meta,
          overdue_customers_now: overdueCustomerCount,
        },
      };
    }),
  };
}

function portfolioNumber(portfolio: MetricsV2DashboardPortfolio | null, section: 'metrics' | 'actions' | 'explore', id: string, key: 'value' | 'count', fallback: number) {
  const value = portfolioItem(portfolio, section, id)?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function fetchSellerDashboardData(
  tenantId: string,
  claims: Pick<JWTClaims, 'sub' | 'role' | 'location_ids'>,
  period: SellerLandingPeriodMeta,
  options: { fullCalloutId?: string } = {},
): Promise<SellerDashboardResponse> {
  const previewRows = <T,>(calloutId: string, rows: T[]) => (
    options.fullCalloutId === calloutId ? rows : rows.slice(0, 3)
  );
  const role = (claims.role === ROLES.SELLER_ASSISTANT ? ROLES.SELLER_ASSISTANT : ROLES.SELLER_ADMIN) as SellerDashboardRole;

  if (!supabaseAdmin) {
    return {
      role,
      period,
      tenant: buildTenantSummary(null, []),
      admin: role === ROLES.SELLER_ADMIN ? { metrics: [], callouts: [], recent_activity: [] } : undefined,
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

  const [portfolioRes, invoiceLandingRes, buyersRes, inventoryRes, ordersRes, estimatesRes, invoicesRes, buyerSnapshotRes] = await Promise.all([
    db
      .schema('app')
      .rpc('get_metrics_v2_seller_dashboard', {
        p_tenant_id: tenantId,
        p_role: claims.role ?? null,
        p_location_ids: scope.mode === 'subset' ? scopedLocationIds : null,
      }),
    db
      .schema('app')
      .rpc('metrics_v2_transaction_landing', {
        p_tenant_id: tenantId,
        p_kind: 'invoices',
        p_location_ids: scope.mode === 'subset' ? scopedLocationIds : null,
      }),
    db
      .schema('app')
      .from('buyers')
      .select('id, business_name, credit_limit, geography, buyer_app_enabled')
      .eq('tenant_id', tenantId),
    inventoryQuery,
    applySellerLocationScope(
      db
        .schema('app')
        .from('orders')
        .select('id, location_id, buyer_id, order_number, status, total_amount, order_date, placed_at, created_at, updated_at, buyers!buyer_id(business_name)')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      claims,
    ),
    applySellerLocationScope(
      db
        .schema('app')
        .from('estimates')
        .select('id, location_id, buyer_id, estimate_number, status, total_amount, estimate_date, created_at, updated_at, buyers!buyer_id(business_name)')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      claims,
    ),
    applySellerLocationScope(
      db
        .schema('app')
        .from('invoices')
        .select('id, location_id, buyer_id, invoice_number, status, total_amount, outstanding_balance, invoice_date, due_date, created_at, updated_at, buyers!buyer_id(business_name)')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      claims,
    ),
    db
      .schema('app')
      .from('metrics_buyer_snapshot')
      .select('buyer_id, invoice_count_90d, invoice_value_90d, app_invoice_value_90d')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
  ]);

  const rawBuyers = (buyersRes.data ?? []) as BuyerRow[];
  const inventoryRows = (inventoryRes.data ?? []) as InventoryRow[];
  const orders = (ordersRes.data ?? []) as OrderRow[];
  const estimates = (estimatesRes.data ?? []) as EstimateRow[];
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const scopedBuyerIds = role === ROLES.SELLER_ASSISTANT
    ? new Set(
        [...orders, ...estimates, ...invoices]
          .map((row) => row.buyer_id)
          .filter((buyerId): buyerId is string => typeof buyerId === 'string' && buyerId.length > 0),
      )
    : null;
  const buyers = scopedBuyerIds
    ? rawBuyers.filter((buyer) => scopedBuyerIds.has(buyer.id))
    : rawBuyers;

  const buyersById = new Map(buyers.map((buyer) => [buyer.id, buyer]));
  const lowStockAlerts = inventoryRows.filter((row) => {
    const reorder = Number(row.reorder_point ?? 0);
    const qty = Number(row.qty_available ?? 0);
    return reorder > 0 && qty <= reorder;
  }).length;

  const currentOrders = orders.filter((row) => inPeriod(orderEventAt(row), period.current_start, period.current_end_exclusive));
  const currentOrdersCount = currentOrders.length;
  // "Invoiced sales" is always trailing-90d per specs/kpi-callout-audit-2026-07-23.md
  // §6 rule 1 — computed here independent of `period` (which the dashboard route
  // hardcodes to calendar 'month' for other, non-headline uses) so this JS-side
  // fallback/sub-label never reverts to calendar-MTD even though `period` itself is MTD.
  const ninetyDaysAgoMs = Date.now() - 90 * DAY_MS;
  const invoices90d = invoices.filter((row) => new Date(invoiceEventAt(row)).getTime() >= ninetyDaysAgoMs);
  const invoicedCustomers90d = new Set(invoices90d.map((row) => row.buyer_id)).size;
  const currentGmv90d = sumNumbers(invoices90d, (row) => Number(row.total_amount ?? 0));
  const overdueInvoicesAll = invoices.filter((invoice) => isInvoiceOverdue(invoice));
  const overdueCustomerCountAll = new Set(overdueInvoicesAll.map((row) => row.buyer_id)).size;
  const invoiceLandingKpis = ((invoiceLandingRes.data as { kpis?: InvoicesKpis } | null)?.kpis ?? {
    invoices_this_period: 0,
    invoices_prev_period: 0,
    invoices_growth_pct: 0,
    gmv_this_period: 0,
    gmv_prev_period: 0,
    aov: 0,
    overdue_count: overdueInvoicesAll.length,
    overdue_sum: overdueInvoicesAll.reduce((sum, invoice) => sum + Number(invoice.outstanding_balance ?? 0), 0),
    overdue_customer_count: overdueCustomerCountAll,
    outstanding_count: 0,
    outstanding_sum: 0,
    outstanding_customer_count: 0,
  }) as InvoicesKpis;
  const portfolio = withInvoiceAlignmentMeta(
    withDashboardAvailabilityMeta(normalizeDashboardPortfolio(portfolioRes.data), featureAvailability),
    invoiceLandingKpis,
    overdueCustomerCountAll,
  );

  const allOrdersSorted = [...orders].sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());
  const allEstimatesSorted = [...estimates].sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());
  const allInvoicesSorted = [...invoices].sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());

  if (role === ROLES.SELLER_ADMIN) {
    const overdueInvoices = overdueInvoicesAll;
    const overdueCustomerCount = overdueCustomerCountAll;
    const primaryKind = portfolio?.primary_demand_kind ?? 'orders';

    const adminMetrics: SellerDashboardMetric[] = [
      {
        label: 'Invoiced sales · Last 90 days',
        value: portfolioNumber(portfolio, 'metrics', 'invoiced_sales', 'value', currentGmv90d),
        sub: `${invoicedCustomers90d} customer${invoicedCustomers90d === 1 ? '' : 's'}`,
      },
      {
        label: 'Open demand',
        value: portfolioNumber(portfolio, 'metrics', 'open_primary_demand_value', 'value', currentOrdersCount),
        sub: `${portfolioNumber(portfolio, 'metrics', 'open_primary_demand_value', 'count', 0)} open ${primaryKind === 'estimates' ? 'estimates' : 'orders'}`,
      },
      {
        label: 'Overdue receivables',
        value: portfolioNumber(portfolio, 'metrics', 'overdue_receivables', 'value', invoiceLandingKpis.overdue_sum),
        sub: `${overdueCustomerCount} customer${overdueCustomerCount === 1 ? '' : 's'}`,
        tone: overdueInvoices.length > 0 ? 'warn' : undefined,
      },
      {
        label: 'Recently sold products out of stock',
        value: portfolioNumber(portfolio, 'metrics', 'recently_sold_products_now_out_of_stock', 'count', lowStockAlerts),
        sub: 'Products sold in the last 90 days',
        tone: lowStockAlerts > 0 ? 'warn' : undefined,
      },
    ];

    // Primary demand action: Estimate follow-up when Estimates are primary,
    // Order execution otherwise — ranked by value (proxy for value+age).
    const primaryDemandRowsAll: SellerDashboardCalloutRow[] = primaryKind === 'estimates'
      ? estimates
          .filter((row) => row.status === 'draft' || row.status === 'sent')
          .sort((a, b) => Number(b.total_amount ?? 0) - Number(a.total_amount ?? 0))
          .map((row, index) => ({
            id: row.id,
            initials: formatInitials(buyerNameFor(row, buyersById) || 'Buyer'),
            hue: hueByIndex(index),
            name: buyerNameFor(row, buyersById),
            reason: `${row.estimate_number ?? 'Draft estimate'} · ${estimateStatusLabel(row.status)}`,
            trailing: formatNumberValue(Number(row.total_amount ?? 0), 'CURRENCY_THRESHOLD'),
            href: `/estimates/${row.id}`,
          }))
      : orders
          .filter((row) => row.status === 'received' || row.status === 'confirmed')
          .sort((a, b) => Number(b.total_amount ?? 0) - Number(a.total_amount ?? 0))
          .map((row, index) => ({
            id: row.id,
            initials: formatInitials(buyerNameFor(row, buyersById) || 'Buyer'),
            hue: hueByIndex(index),
            name: buyerNameFor(row, buyersById),
            reason: `${row.order_number} · ${orderStatusLabel(row.status)}`,
            trailing: formatNumberValue(Number(row.total_amount ?? 0), 'CURRENCY_THRESHOLD'),
            href: `/sales-orders/${row.id}`,
          }));

    // Collections: overdue invoices aggregated per buyer (amount, invoice
    // count, oldest-due age) — ranked by amount, not the first 3 unsorted rows.
    const overdueByBuyer = new Map<string, { amount: number; count: number; oldestDue: string | null; buyerName: string | null }>();
    for (const invoice of overdueInvoices) {
      const agg = overdueByBuyer.get(invoice.buyer_id) ?? { amount: 0, count: 0, oldestDue: null, buyerName: null };
      const resolvedBuyerName = buyerNameFor(invoice, buyersById);
      agg.amount += Number(invoice.outstanding_balance ?? 0);
      agg.count += 1;
      if (!agg.buyerName && resolvedBuyerName !== 'Unknown buyer') {
        agg.buyerName = resolvedBuyerName;
      }
      if (invoice.due_date && (!agg.oldestDue || new Date(invoice.due_date) < new Date(agg.oldestDue))) {
        agg.oldestDue = invoice.due_date;
      }
      overdueByBuyer.set(invoice.buyer_id, agg);
    }
    const collectionsRowsAll: SellerDashboardCalloutRow[] = Array.from(overdueByBuyer.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([buyerId, agg], index) => {
        const daysOverdue = agg.oldestDue ? Math.max(0, Math.round((Date.now() - new Date(agg.oldestDue).getTime()) / DAY_MS)) : null;
        const buyerName = agg.buyerName ?? buyersById.get(buyerId)?.business_name ?? 'Unknown buyer';
        return {
          id: buyerId,
          initials: formatInitials(buyerName === 'Unknown buyer' ? 'Buyer' : buyerName),
          hue: hueByIndex(index),
          name: buyerName,
          reason: `${formatNumberValue(agg.count, 'COUNT')} invoice${agg.count === 1 ? '' : 's'}${daysOverdue != null ? ` · ${daysOverdue}d overdue` : ''}`,
          trailing: formatNumberValue(agg.amount, 'CURRENCY_THRESHOLD'),
          href: `/customers/${buyerId}`,
        };
      });

    // Buyer App activation: valuable customers (real invoiced value in the
    // last 90 days) who are either not on the Buyer App or enabled but not
    // ordering through it — ranked by their commercial value.
    const buyerSnapshotByBuyer = new Map(((buyerSnapshotRes.data ?? []) as BuyerSnapshotRow[]).map((row) => [row.buyer_id, row]));
    const buyerAppRowsAll: SellerDashboardCalloutRow[] = buyers
      .map((buyer) => {
        const snapshot = buyerSnapshotByBuyer.get(buyer.id);
        return {
          buyer,
          invoiceValue90d: Number(snapshot?.invoice_value_90d ?? 0),
          invoiceCount90d: Number(snapshot?.invoice_count_90d ?? 0),
          appValue90d: Number(snapshot?.app_invoice_value_90d ?? 0),
        };
      })
      .filter((row) => row.invoiceValue90d > 0 && (!row.buyer.buyer_app_enabled || row.appValue90d === 0))
      .sort((a, b) => b.invoiceValue90d - a.invoiceValue90d)
      .map((row, index) => ({
        id: row.buyer.id,
        initials: formatInitials(row.buyer.business_name),
        hue: hueByIndex(index),
        name: row.buyer.business_name,
        reason: `${row.buyer.buyer_app_enabled ? 'App enabled, unused' : 'Not on Buyer App'} · ${formatNumberValue(row.invoiceCount90d, 'COUNT')} invoices 90d`,
        trailing: formatNumberValue(row.invoiceValue90d, 'CURRENCY_THRESHOLD'),
        href: `/customers/${row.buyer.id}`,
      }));

    const adminCallouts: SellerDashboardCalloutItem[] = [
      {
        id: primaryKind === 'estimates' ? 'estimate_follow_up' : 'order_execution',
        kind: 'info',
        eyebrow: primaryKind === 'estimates' ? 'Estimate follow-up' : 'Order execution',
        hint: formatNumberValue(primaryDemandRowsAll.length, 'COUNT'),
        rows: previewRows(primaryKind === 'estimates' ? 'estimate_follow_up' : 'order_execution', primaryDemandRowsAll),
      },
      {
        id: 'collections',
        kind: 'risk',
        eyebrow: 'Collections',
        hint: `${formatNumberValue(overdueByBuyer.size, 'COUNT')}`,
        rows: previewRows('collections', collectionsRowsAll),
      },
      {
        id: 'buyer_app_activation',
        kind: 'opportunity',
        eyebrow: 'Buyer App activation',
        hint: formatNumberValue(buyerAppRowsAll.length, 'COUNT'),
        rows: previewRows('buyer_app_activation', buyerAppRowsAll),
      },
    ];

    const recentActivity: SellerDashboardRecentActivityRow[] = [
      ...allOrdersSorted.slice(0, 5).map((row) => ({
        id: `order-${row.id}`,
        kind: 'order' as const,
        href: `/sales-orders/${row.id}`,
        document_number: row.order_number,
        customer_name: buyerNameFor(row, buyersById),
        status: { label: orderStatusLabel(row.status), tone: statusToneForOrder(row.status) },
        amount: Number(row.total_amount ?? 0),
        updated_at: row.updated_at ?? row.created_at,
      })),
      ...allEstimatesSorted.slice(0, 5).map((row) => ({
        id: `estimate-${row.id}`,
        kind: 'estimate' as const,
        href: `/estimates/${row.id}`,
        document_number: row.estimate_number ?? 'Draft estimate',
        customer_name: buyerNameFor(row, buyersById),
        status: { label: estimateStatusLabel(row.status), tone: estimateStatusTone(row.status) },
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
          customer_name: buyerNameFor(row, buyersById),
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
      portfolio,
      admin: {
        metrics: adminMetrics,
        callouts: adminCallouts,
        recent_activity: recentActivity,
      },
    };
  }

  const recentSinceIso = period.current_start;
  const lowStockFeatureEnabled = zohoEnabled || featureAvailability.tallyExport;

  const lastOrderByBuyer = new Map<string, OrderRow>();
  for (const order of [...orders].sort((a, b) => new Date(orderEventAt(b)).getTime() - new Date(orderEventAt(a)).getTime())) {
    if (!lastOrderByBuyer.has(order.buyer_id)) {
      lastOrderByBuyer.set(order.buyer_id, order);
    }
  }

  const overdueInvoices = invoices.filter((invoice) => {
    if (!isInvoiceOverdue(invoice) || !invoice.due_date) return false;
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
      value: invoiceLandingKpis.overdue_count,
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
      const lastOrderAt = lastOrder ? orderEventAt(lastOrder) : null;
      if (!lastOrderAt) return false;
      return (Date.now() - new Date(lastOrderAt).getTime()) / DAY_MS > 30;
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
        ? `Overdue ${formatNumberValue(row.dues, 'CURRENCY_THRESHOLD')} · last order ${row.lastOrder ? formatTimeAgo(orderEventAt(row.lastOrder)) : 'never'}`
        : `Credit usage ${row.utilization}% · last order ${row.lastOrder ? formatTimeAgo(orderEventAt(row.lastOrder)) : 'never'}`,
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
        reason: `${buyerNameFor(row, buyersById)} · ${orderStatusLabel(row.status)}`,
        trailing: formatNumberValue(Number(row.total_amount ?? 0), 'CURRENCY_THRESHOLD'),
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
        reason: `${buyerNameFor(row, buyersById)} · ${estimateStatusLabel(row.status)}`,
        trailing: formatNumberValue(Number(row.total_amount ?? 0), 'CURRENCY_THRESHOLD'),
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
        reason: `${buyerNameFor(row, buyersById)} · ${invoicePresentation(row).label}`,
        trailing: formatNumberValue(Number(row.total_amount ?? 0), 'CURRENCY_THRESHOLD'),
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
    .filter((row) => row.lastOrder && (Date.now() - new Date(orderEventAt(row.lastOrder)).getTime()) / DAY_MS > 30)
    .slice(0, 4)
    .map((row, index): SellerDashboardCalloutRow => ({
        id: row.buyer.id,
        initials: formatInitials(row.buyer.business_name),
        hue: hueByIndex(index),
        name: row.buyer.business_name,
        reason: `Last order ${new Date(orderEventAt(row.lastOrder!)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
        trailing: formatNumberValue(Number(row.lastOrder?.total_amount ?? 0), 'CURRENCY_THRESHOLD'),
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
        id: 'needs_action',
        kind: 'risk',
        eyebrow: 'Needs action',
        hint: `${overdueInvoices.length} overdue`,
        rows: previewRows('needs_action', needsActionRows),
      },
      {
        id: 'recent_activity',
        kind: 'info',
        eyebrow: 'Recent activity',
        hint: sellerLandingPeriodLabel(period.selected),
        rows: previewRows('recent_activity', recentActivityRows),
      },
      {
        id: 're_engage',
        kind: 'opportunity',
        eyebrow: 'Re-engage',
        hint: 'Dormant for 30+ days',
        rows: previewRows('re_engage', reengageRows),
      },
    ];

  return {
    role,
    period,
    tenant,
    portfolio,
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
  options: { fullCalloutId?: string } = {},
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
    options.fullCalloutId ?? 'preview',
  ];

  return unstable_cache(
    () => fetchSellerDashboardData(tenantId, claims, period, options),
    cacheKey,
    { revalidate: 30, tags: [`seller-dashboard:${tenantId}`] },
  )();
}
