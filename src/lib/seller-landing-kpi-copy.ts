/**
 * Frontend-owned KPI title/subtitle copy for seller landing pages, keyed by
 * kpi_id per page. Previously this text lived as literal SQL string
 * arguments inside app.metrics_v4_kpi() / app._metrics_v4_refresh_landing_kpis
 * (supabase/migrations) and was stored in app.metrics_landing_kpi_snapshot.kpis.
 * That meant a copy tweak needed a DB migration, and every tenant/page/period
 * row carried static text that never varies at runtime. The DB now only
 * returns numeric fields (value, entity_count, document_count,
 * secondary_value, time_basis, filter_preset) — wording lives here instead.
 */
import { formatNumberValue } from '@/lib/utils';

export interface KpiCopyCard {
  id: string;
  entity_count?: number | null;
  document_count?: number | null;
  secondary_value?: number | null;
}

export interface KpiCopyEntry {
  label: string;
  supportingText: (card: KpiCopyCard) => string;
}

export type KpiCopyMap = Record<string, KpiCopyEntry>;

function countText(count: number | null | undefined, noun: string): string | null {
  if (count == null) return null;
  return `${formatNumberValue(Number(count), 'COUNT')} ${noun}`;
}

/** "142 customers · 89 invoices" style — entity_count paired with document_count. */
function entityAndDocs(entityNoun: string, documentNoun: string) {
  return (card: KpiCopyCard) => {
    const parts = [
      countText(card.entity_count, entityNoun),
      countText(card.document_count, documentNoun),
    ].filter((p): p is string => Boolean(p));
    return parts.join(' · ') || '—';
  };
}

/** "142 customers" style — entity_count only. */
function entityOnly(entityNoun: string) {
  return (card: KpiCopyCard) => countText(card.entity_count, entityNoun) ?? '—';
}

/** "58 products · 12% of all products" style — entity_count vs secondary_value total. */
function entityWithPercentOfTotal(entityNoun: string, totalNoun: string) {
  return (card: KpiCopyCard) => {
    const entity = countText(card.entity_count, entityNoun);
    if (card.secondary_value == null || Number(card.secondary_value) <= 0) return entity ?? '—';
    const pct = card.entity_count == null ? 0 : (Number(card.entity_count) / Number(card.secondary_value)) * 100;
    const pctText = `${formatNumberValue(pct, 'PERCENTAGE')} of all ${totalNoun}`;
    return entity ? `${entity} · ${pctText}` : pctText;
  };
}

const OVERDUE_RECEIVABLES: KpiCopyEntry = {
  label: 'Overdue receivables',
  supportingText: entityAndDocs('customers', 'invoices'),
};

export const DASHBOARD_KPI_COPY: KpiCopyMap = {
  invoiced_sales: { label: 'Invoiced Sales', supportingText: entityAndDocs('customers', 'invoices') },
  demand: { label: 'Demand', supportingText: entityAndDocs('customers', 'demand documents') },
  outstanding_dues: { label: 'Outstanding dues', supportingText: entityAndDocs('customers', 'invoices') },
  overdue_receivables: OVERDUE_RECEIVABLES,
};

export const ESTIMATES_KPI_COPY: KpiCopyMap = {
  estimate_value_created: { label: 'Estimate value created', supportingText: entityAndDocs('customers', 'estimates') },
  open_estimates: { label: 'Open estimates', supportingText: entityAndDocs('customers', 'estimates') },
  awaiting_action_3d: { label: 'Awaiting action 3+ days', supportingText: entityAndDocs('customers', 'estimates') },
  expiring_7d: { label: 'Expiring in 7 days', supportingText: entityAndDocs('customers', 'estimates') },
};

export const ORDERS_KPI_COPY: KpiCopyMap = {
  order_value_created: { label: 'Order value created', supportingText: entityAndDocs('customers', 'orders') },
  open_orders: { label: 'Open orders', supportingText: entityAndDocs('customers', 'orders') },
  waiting_confirmation: { label: 'Waiting for confirmation', supportingText: entityAndDocs('customers', 'orders') },
  awaiting_dispatch_3d: { label: 'Awaiting dispatch 3+ days', supportingText: entityAndDocs('customers', 'orders') },
};

export const INVOICES_KPI_COPY: KpiCopyMap = {
  invoiced_sales: { label: 'Invoiced Sales', supportingText: entityAndDocs('customers', 'invoices') },
  outstanding_dues: { label: 'Outstanding dues', supportingText: entityAndDocs('customers', 'invoices') },
  overdue_receivables: OVERDUE_RECEIVABLES,
  due_7d: { label: 'Due in 7 days', supportingText: entityAndDocs('customers', 'invoices') },
};

export const CUSTOMERS_KPI_COPY: KpiCopyMap = {
  active_customers: { label: 'Active Customers', supportingText: () => 'purchased at least once' },
  dormant_customers: { label: 'Dormant Customers', supportingText: () => 'no purchase in quarter' },
  overdue_receivables: OVERDUE_RECEIVABLES,
  top80_customers: { label: 'Top customers driving 80% of revenue', supportingText: () => 'customers in revenue concentration set' },
};

export const PRODUCTS_KPI_COPY: KpiCopyMap = {
  products_sold: { label: 'Products that sold', supportingText: entityOnly('products') },
  recently_sold_oos: { label: 'Recently sold, now out of stock', supportingText: entityOnly('products') },
  running_low: { label: 'Products running low', supportingText: entityOnly('products') },
  did_not_sell: { label: 'Products that did not sell', supportingText: entityOnly('products') },
};

export const CATEGORIES_KPI_COPY: KpiCopyMap = {
  categories_sold: { label: 'Categories that sold', supportingText: entityWithPercentOfTotal('categories', 'categories') },
  recently_sold_oos: { label: 'Recently sold, now out of stock', supportingText: entityOnly('categories') },
  running_low: { label: 'Categories running low', supportingText: entityOnly('categories') },
  did_not_sell: { label: 'Categories that did not sell', supportingText: entityOnly('categories') },
};

export const BRANDS_KPI_COPY: KpiCopyMap = {
  active_brands: { label: 'Active brands', supportingText: entityWithPercentOfTotal('brands', 'brands') },
  top80_brands: { label: 'Top 80% brands', supportingText: () => 'brands in revenue concentration set' },
  did_not_sell: { label: 'Brands that did not sell', supportingText: entityOnly('brands') },
  dormant_brands: { label: 'Dormant brands', supportingText: entityOnly('brands') },
};

export const LOCATIONS_KPI_COPY: KpiCopyMap = {
  invoiced_sales: { label: 'Invoiced Sales', supportingText: entityAndDocs('locations', 'invoices') },
  open_demand: { label: 'Open demand', supportingText: entityAndDocs('locations', 'demand docs') },
  overdue_receivables: { label: 'Overdue receivables', supportingText: entityOnly('locations') },
  top80_locations: { label: 'Top 80% locations', supportingText: () => 'locations in revenue concentration set' },
};

export const WAREHOUSES_KPI_COPY: KpiCopyMap = {
  sellable_units: { label: 'Sellable Units in stock', supportingText: entityOnly('products in warehouses') },
  unique_skus: { label: 'Unique SKUs across warehouses', supportingText: entityOnly('warehouses') },
  recently_sold_oos: { label: 'Recently sold, now out of stock', supportingText: entityOnly('warehouses with stockouts') },
  no_sales: { label: 'No sales in period', supportingText: entityOnly('stocked warehouses') },
};

export const BUYER_APP_KPI_COPY: KpiCopyMap = {
  customers_with_access: { label: 'Customers with app access', supportingText: () => '% of total customers' },
  app_sourced_demand_qtd: { label: 'App-sourced demand · this quarter', supportingText: entityAndDocs('customers', 'demand docs') },
  app_sourced_invoiced_sales_qtd: { label: 'App-sourced invoiced sales · this quarter', supportingText: entityAndDocs('customers', 'invoices') },
  app_no_order_customers_qtd: { label: 'App access · no order this quarter', supportingText: () => '% of enabled customers' },
};

/** Campaigns landing page (frontend dir: catalogs). */
export const CAMPAIGNS_KPI_COPY: KpiCopyMap = {
  live_campaigns: { label: 'Live Campaigns', supportingText: () => 'expiring in 7 days' },
  campaign_open_rate: { label: 'Campaign Open rate', supportingText: () => 'customers viewed' },
  campaign_demand: { label: 'Campaign demand', supportingText: entityAndDocs('customers', 'demand docs') },
  campaign_revenue: { label: 'Campaign revenue', supportingText: entityAndDocs('customers', 'invoices') },
};

/** Customer Groups landing page (frontend dir: cohorts). */
export const CUSTOMER_GROUPS_KPI_COPY: KpiCopyMap = {
  active_groups: { label: 'Active groups', supportingText: () => 'assigned customers' },
  customers_assigned: { label: 'Customers assigned to a group', supportingText: () => 'of total customers' },
  valuable_no_group: { label: 'Valuable customers in no group', supportingText: () => 'top revenue customers without group' },
  grouped_purchased: { label: 'Grouped customers who purchased', supportingText: () => 'groups with purchasing members' },
};

export function kpiLabel(map: KpiCopyMap, card: { id: string }): string {
  return map[card.id]?.label ?? card.id;
}

export function kpiSupportingText(map: KpiCopyMap, card: KpiCopyCard): string {
  const entry = map[card.id];
  return entry ? entry.supportingText(card) : '—';
}
