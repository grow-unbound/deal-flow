import type { JWTClaims } from '@/lib/auth';
import { getSellerLocationScope } from '@/lib/server/seller-location-access';
import { supabaseAdmin } from '@/lib/supabase';
import type { MetricsV2DashboardPortfolio, MetricsV2PortfolioItem, SellerDashboardMetricsV4 } from '@/types/seller-dashboard';
import type {
  PulseContributionCard,
  PulseContributionResponse,
  PulseOpportunityGroup,
  PulseOpportunityPreview,
} from '@/types/pulse';

export function emptyPulseContribution(): PulseContributionResponse {
  return {
    source: 'app.get_landing_metrics_v4',
    computed_at: null,
    source_watermark: null,
    freshness_label: null,
    primary_demand_kind: 'none',
    cards: [],
    empty_opportunity: null,
  };
}

export function emptyPulseOpportunities() {
  return {
    source: 'app.get_buyer_app_dashboard_v4' as const,
    computed_at: null,
    source_watermark: null,
    freshness_label: null,
    groups: [],
  };
}

function normalizePortfolio(raw: unknown): MetricsV2DashboardPortfolio | null {
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

function findPortfolioItem(portfolio: MetricsV2DashboardPortfolio, section: 'metrics' | 'actions' | 'explore', id: string): MetricsV2PortfolioItem | null {
  return portfolio[section].find((item) => item.id === id) ?? null;
}

function itemCount(item: MetricsV2PortfolioItem | null) {
  return typeof item?.count === 'number' ? item.count : 0;
}

function itemValue(item: MetricsV2PortfolioItem | null) {
  return typeof item?.value === 'number' ? item.value : 0;
}

function rowsFromItem(item: MetricsV2PortfolioItem | null): Array<Record<string, unknown>> {
  const rows = item?.meta?.rows;
  return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : [];
}

function numericMeta(item: MetricsV2PortfolioItem | null, key: string) {
  const value = item?.meta?.[key];
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function rowNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key] ?? 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function oldestTimestamp(...values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return null;
  return new Date(Math.min(...timestamps)).toISOString();
}

export async function loadPulsePortfolio(claims: Pick<JWTClaims, 'tenant_id' | 'role' | 'location_ids'>) {
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) {
    return { portfolio: null, status: 403 as const, error: null };
  }
  if (!supabaseAdmin) {
    return { portfolio: null, status: 500 as const, error: new Error('Server configuration error') };
  }

  const locationScope = getSellerLocationScope({
    role: claims.role ?? null,
    location_ids: claims.location_ids ?? null,
  });

  if (locationScope.mode === 'none') {
    return { portfolio: null, status: 200 as const, error: null };
  }

  const { data, error } = await (supabaseAdmin as any)
    .schema('app')
    .rpc('get_buyer_app_dashboard_v4', {
      p_tenant_id: claims.tenant_id,
      p_role: claims.role ?? null,
      p_location_ids: locationScope.mode === 'subset' ? locationScope.locationIds : null,
    });

  if (error) {
    return { portfolio: null, status: 500 as const, error };
  }

  return { portfolio: normalizePortfolio(data), status: 200 as const, error: null };
}

export function portfolioToPulseContribution(portfolio: MetricsV2DashboardPortfolio | null): PulseContributionResponse {
  if (!portfolio) return emptyPulseContribution();

  const demand = findPortfolioItem(portfolio, 'metrics', 'app_sourced_demand_value_share');
  const demandCustomers = findPortfolioItem(portfolio, 'metrics', 'customers_submitting_app_demand');
  const invoiced = findPortfolioItem(portfolio, 'metrics', 'app_sourced_invoiced_sales_share');
  const repeat = findPortfolioItem(portfolio, 'metrics', 'repeat_app_customers');
  const access = findPortfolioItem(portfolio, 'metrics', 'customers_with_access');
  const contributionTimeBasis = demand?.time_basis || demandCustomers?.time_basis || 'QTD';
  const sourceWatermark = oldestTimestamp(portfolio.source_watermark, demand?.meta?.source_watermark as string | null, invoiced?.meta?.source_watermark as string | null);

  const appDemandValue = numericMeta(demand, 'app_demand_value_90d');
  const appInvoicedValue = numericMeta(invoiced, 'app_invoiced_sales_90d');
  const demandCount = itemCount(demand);
  const activeBuyerCount = itemCount(demandCustomers);
  const repeatBuyerCount = itemCount(repeat);
  const accessBuyerCount = itemCount(access);

  const maybeCards: Array<PulseContributionCard | null> = [
    accessBuyerCount > 0 ? {
      id: 'yukti_access_enabled',
      label: 'Customers with Yukti access',
      value: accessBuyerCount,
      value_kind: 'count',
      buyer_count: accessBuyerCount,
      time_basis: access?.time_basis || 'NOW',
      evidence: 'Customers who can submit demand through Yukti',
    } : null,
    appDemandValue > 0 || demandCount > 0 || activeBuyerCount > 0 ? {
      id: 'demand_captured',
      label: 'Demand captured through Yukti',
      value: appDemandValue,
      value_kind: 'currency',
      document_count: demandCount,
      buyer_count: activeBuyerCount,
      time_basis: contributionTimeBasis,
      evidence: `${demandCount} submitted demand document${demandCount === 1 ? '' : 's'} from ${activeBuyerCount} buyer${activeBuyerCount === 1 ? '' : 's'}`,
    } : null,
    appInvoicedValue > 0 ? {
      id: 'invoiced_from_captured_demand',
      label: 'Invoiced from captured demand',
      value: appInvoicedValue,
      value_kind: 'currency',
      share_pct: itemValue(invoiced),
      time_basis: invoiced?.time_basis || contributionTimeBasis,
      evidence: itemValue(invoiced) > 0 ? `${itemValue(invoiced)}% of invoiced value in the period` : 'Yukti-attributed invoices in the period',
    } : null,
    activeBuyerCount > 0 ? {
      id: 'active_yukti_buyers',
      label: 'Active buyers through Yukti',
      value: activeBuyerCount,
      value_kind: 'count',
      buyer_count: activeBuyerCount,
      time_basis: demandCustomers?.time_basis || contributionTimeBasis,
      evidence: 'Buyers who submitted Yukti demand',
    } : null,
    repeatBuyerCount > 0 ? {
      id: 'repeat_yukti_buyers',
      label: 'Repeat buyers through Yukti',
      value: repeatBuyerCount,
      value_kind: 'count',
      buyer_count: repeatBuyerCount,
      time_basis: repeat?.time_basis || contributionTimeBasis,
      evidence: 'Buyers with at least two Yukti demand submissions',
    } : null,
  ];
  const cards = maybeCards.filter((card): card is PulseContributionCard => Boolean(card));

  const opportunities = portfolioToPulseOpportunities(portfolio);

  return {
    source: 'app.get_buyer_app_dashboard_v4',
    computed_at: portfolio.as_of,
    source_watermark: sourceWatermark ?? portfolio.source_watermark,
    freshness_label: sourceWatermark ?? portfolio.source_watermark ?? portfolio.as_of,
    primary_demand_kind: portfolio.primary_demand_kind,
    cards,
    empty_opportunity: opportunities.groups[0] ?? null,
  };
}

export function landingMetricsToPulseContribution(metrics: SellerDashboardMetricsV4 | null): PulseContributionResponse {
  if (!metrics) return emptyPulseContribution();

  const demand = metrics.cards.find((card) => card.id === 'app_sourced_demand_qtd') ?? null;
  const invoiced = metrics.cards.find((card) => card.id === 'app_sourced_invoiced_sales_qtd') ?? null;
  const access = metrics.cards.find((card) => card.id === 'customers_with_access') ?? null;
  const timeBasis = metrics.period.label ?? 'This Quarter';
  const maybeCards: Array<PulseContributionCard | null> = [
    access && Number(access.entity_count ?? access.value ?? 0) > 0 ? {
      id: 'yukti_access_enabled',
      label: 'Customers with Yukti access',
      value: Number(access.entity_count ?? access.value ?? 0),
      value_kind: 'count',
      buyer_count: Number(access.entity_count ?? access.value ?? 0),
      time_basis: access.time_basis || 'now',
      evidence: 'Customers who can submit demand through Yukti',
    } : null,
    demand && (Number(demand.value ?? 0) > 0 || Number(demand.document_count ?? 0) > 0 || Number(demand.entity_count ?? 0) > 0) ? {
      id: 'demand_captured',
      label: 'Demand captured through Yukti',
      value: Number(demand.value ?? 0),
      value_kind: 'currency',
      document_count: demand.document_count ?? null,
      buyer_count: demand.entity_count ?? null,
      time_basis: demand.time_basis || timeBasis,
      evidence: `${Number(demand.document_count ?? 0)} submitted demand document${Number(demand.document_count ?? 0) === 1 ? '' : 's'} from ${Number(demand.entity_count ?? 0)} buyer${Number(demand.entity_count ?? 0) === 1 ? '' : 's'}`,
    } : null,
    invoiced && Number(invoiced.value ?? 0) > 0 ? {
      id: 'invoiced_from_captured_demand',
      label: 'Invoiced from captured demand',
      value: Number(invoiced.value ?? 0),
      value_kind: 'currency',
      document_count: invoiced.document_count ?? null,
      buyer_count: invoiced.entity_count ?? null,
      share_pct: invoiced.secondary_value && Number(invoiced.secondary_value) > 0
        ? Number(((Number(invoiced.value ?? 0) / Number(invoiced.secondary_value)) * 100).toFixed(1))
        : null,
      time_basis: invoiced.time_basis || timeBasis,
      evidence: `${Number(invoiced.document_count ?? 0)} Yukti-attributed invoice${Number(invoiced.document_count ?? 0) === 1 ? '' : 's'} from ${Number(invoiced.entity_count ?? 0)} buyer${Number(invoiced.entity_count ?? 0) === 1 ? '' : 's'}`,
    } : null,
    demand && Number(demand.entity_count ?? 0) > 0 ? {
      id: 'active_yukti_buyers',
      label: 'Active buyers through Yukti',
      value: Number(demand.entity_count ?? 0),
      value_kind: 'count',
      buyer_count: demand.entity_count ?? null,
      time_basis: demand.time_basis || timeBasis,
      evidence: 'Buyers who submitted Yukti demand',
    } : null,
  ];
  const cards = maybeCards.filter((card): card is PulseContributionCard => Boolean(card));

  return {
    source: 'app.get_landing_metrics_v4',
    computed_at: metrics.computed_at,
    source_watermark: metrics.source_watermark,
    freshness_label: metrics.source_watermark ?? metrics.computed_at,
    primary_demand_kind: 'none',
    cards,
    empty_opportunity: null,
  };
}

function previewRows(item: MetricsV2PortfolioItem | null, valueKeys: string[] = [], evidenceLabel = 'assisted business'): PulseOpportunityPreview[] {
  return rowsFromItem(item).slice(0, 3).map((row) => {
    const name = String(row.name ?? row.business_name ?? 'Customer');
    const buyerId = String(row.buyer_id ?? row.id ?? '');
    const evidenceValue = rowNumber(row, valueKeys);
    return {
      buyer_id: buyerId,
      name,
      initials: initials(name),
      evidence_value: evidenceValue,
      evidence_label: evidenceValue ? evidenceLabel : null,
      href: buyerId ? `/customers/${buyerId}` : '/customers',
    };
  });
}

export function portfolioToPulseOpportunities(portfolio: MetricsV2DashboardPortfolio | null) {
  if (!portfolio) return emptyPulseOpportunities();

  const definitions: Array<{
    id: PulseOpportunityGroup['id'];
    title: string;
    description: string;
    evidence: (item: MetricsV2PortfolioItem) => string;
    action_label: string;
    href: string;
    valueKeys?: string[];
    valueLabel?: string;
  }> = [
    {
      id: 'valuable_assisted_customers_without_access',
      title: 'Activate valuable customers',
      description: 'High-value customers still order manually and do not have Yukti access enabled.',
      evidence: (item) => `${item.count ?? 0} customers ranked by assisted business in ${item.time_basis}`,
      action_label: 'Open access management',
      href: '/buyer-app/access?status=suggested',
      valueKeys: ['invoice_value_90d'],
      valueLabel: 'assisted business',
    },
    {
      id: 'access_enabled_but_never_used',
      title: 'Convert interested customers',
      description: 'Customers have access enabled but still do business outside Yukti.',
      evidence: (item) => `${item.count ?? 0} access-enabled customers have no recorded Yukti use`,
      action_label: 'Review enabled customers',
      href: '/buyer-app/access?status=inactive',
      valueKeys: ['business_outside_yukti_90d', 'assisted_invoice_value_90d', 'invoice_value_90d'],
      valueLabel: 'business outside Yukti',
    },
    {
      id: 'used_app_but_no_demand',
      title: 'Convert browsers into demand',
      description: 'Customers used Yukti, yet their recent business still sits outside Yukti demand.',
      evidence: (item) => `${item.count ?? 0} customers used Yukti without demand`,
      action_label: 'Review customer access',
      href: '/buyer-app/access?status=inactive',
      valueKeys: ['business_outside_yukti_90d', 'assisted_invoice_value_90d', 'invoice_value_90d'],
      valueLabel: 'business outside Yukti',
    },
    {
      id: 'previously_submitted_app_demand_now_inactive',
      title: 'Reactivate customers going quiet',
      description: 'Customers previously submitted Yukti demand but have gone inactive.',
      evidence: (item) => `${item.count ?? 0} prior Yukti-demand customers are now inactive`,
      action_label: 'Review inactive customers',
      href: '/buyer-app/access?status=inactive',
    },
  ];

  const groups = definitions
    .map((definition) => {
      const item = findPortfolioItem(portfolio, 'actions', definition.id);
      if (!item || item.available === false || itemCount(item) <= 0) return null;
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        count: itemCount(item),
        time_basis: item.time_basis,
        evidence: definition.evidence(item),
        action_label: definition.action_label,
        href: definition.href,
        previews: previewRows(item, definition.valueKeys, definition.valueLabel),
      };
    })
    .filter((group): group is PulseOpportunityGroup => Boolean(group))
    .slice(0, 3);

  return {
    source: 'app.get_buyer_app_dashboard_v4' as const,
    computed_at: portfolio.as_of,
    source_watermark: portfolio.source_watermark,
    freshness_label: portfolio.source_watermark ?? portfolio.as_of,
    groups,
  };
}
