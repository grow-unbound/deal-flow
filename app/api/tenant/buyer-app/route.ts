import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { getSellerLocationScope } from '@/lib/server/seller-location-access';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerAppLandingResponse } from '@/hooks/useBuyerApp';
import type { MetricsV2DashboardPortfolio, MetricsV2PortfolioItem } from '@/types/seller-dashboard';

function emptyResponse(period: BuyerAppLandingResponse['period']): BuyerAppLandingResponse {
  return {
    period,
    kpis: {
      enabled_buyers: 0,
      total_buyers: 0,
      app_gmv: 0,
      app_orders: 0,
      active_buyers: 0,
      app_estimates_value: 0,
      app_estimates_count: 0,
      converted_to_order_value: 0,
      converted_to_order_count: 0,
      invoiced_value: 0,
      invoiced_count: 0,
    },
    snapshot: {
      enabled_buyers: 0,
      total_buyers: 0,
      opened_app_mtd: 0,
      ordered_mtd: 0,
      repeat_mtd: 0,
      app_gmv_mtd: 0,
      app_orders_mtd: 0,
      total_gmv_mtd: 0,
      estimates_app_value_mtd: 0,
      estimates_app_count_mtd: 0,
      converted_order_value_mtd: 0,
      converted_order_count_mtd: 0,
      invoiced_app_value_mtd: 0,
      invoiced_app_count_mtd: 0,
      not_ordering_buyers: [],
      top_app_buyers_callout: [],
      no_app_buyers: [],
      top_app_buyers_card: [],
      top_locations: [],
      refreshed_at: new Date().toISOString(),
    },
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

function findPortfolioItem(portfolio: MetricsV2DashboardPortfolio | null, section: 'metrics' | 'actions' | 'explore', id: string): MetricsV2PortfolioItem | null {
  return portfolio?.[section]?.find((item) => item.id === id) ?? null;
}

function itemCount(item: MetricsV2PortfolioItem | null) {
  return typeof item?.count === 'number' ? item.count : 0;
}

function itemValue(item: MetricsV2PortfolioItem | null) {
  return typeof item?.value === 'number' ? item.value : 0;
}

function rowsFromItem<T>(item: MetricsV2PortfolioItem | null): T[] {
  const rows = item?.meta?.rows;
  return Array.isArray(rows) ? rows as T[] : [];
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function portfolioToResponse(
  period: BuyerAppLandingResponse['period'],
  portfolio: MetricsV2DashboardPortfolio,
): BuyerAppLandingResponse {
  const access = findPortfolioItem(portfolio, 'metrics', 'customers_with_access');
  const demand = findPortfolioItem(portfolio, 'metrics', 'customers_submitting_app_demand');
  const invoiceShare = findPortfolioItem(portfolio, 'metrics', 'app_sourced_invoiced_sales_share');
  const repeat = findPortfolioItem(portfolio, 'metrics', 'repeat_app_customers');
  const demandShare = findPortfolioItem(portfolio, 'metrics', 'app_sourced_demand_value_share');
  const used = findPortfolioItem(portfolio, 'metrics', 'customers_who_used_app');
  const accessEnabledUnused = findPortfolioItem(portfolio, 'actions', 'access_enabled_but_never_used');
  const assistedWithoutAccess = findPortfolioItem(portfolio, 'actions', 'valuable_assisted_customers_without_access');
  const adoptionByLocation = findPortfolioItem(portfolio, 'explore', 'adoption_by_location');
  const businessThroughApp = findPortfolioItem(portfolio, 'explore', 'business_through_app');

  const businessMeta = businessThroughApp?.meta ?? {};
  const appInvoiced = Number(businessMeta.app_invoiced_sales_90d ?? 0);
  const appDemandValue = Number(businessMeta.app_primary_demand_value_90d ?? 0);
  const appDemandCount = itemCount(demandShare);
  const enabledNeverUsedRows = rowsFromItem<Record<string, unknown>>(accessEnabledUnused);
  const assistedRows = rowsFromItem<Record<string, unknown>>(assistedWithoutAccess);
  const locations = Array.isArray(adoptionByLocation?.meta?.locations)
    ? adoptionByLocation.meta.locations as Array<Record<string, unknown>>
    : [];

  return {
    period,
    portfolio,
    kpis: {
      enabled_buyers: itemCount(access),
      total_buyers: itemCount(access),
      app_gmv: appDemandValue,
      app_orders: appDemandCount,
      active_buyers: itemCount(used),
      app_estimates_value: portfolio.primary_demand_kind === 'estimates' ? appDemandValue : 0,
      app_estimates_count: portfolio.primary_demand_kind === 'estimates' ? appDemandCount : 0,
      converted_to_order_value: portfolio.primary_demand_kind === 'orders' ? appDemandValue : 0,
      converted_to_order_count: portfolio.primary_demand_kind === 'orders' ? appDemandCount : 0,
      invoiced_value: appInvoiced,
      invoiced_count: 0,
    },
    snapshot: {
      enabled_buyers: itemCount(access),
      total_buyers: itemCount(access),
      opened_app_mtd: itemCount(used),
      ordered_mtd: itemCount(demand),
      repeat_mtd: itemCount(repeat),
      app_gmv_mtd: appDemandValue,
      app_orders_mtd: appDemandCount,
      total_gmv_mtd: Number(businessMeta.total_primary_demand_value_90d ?? 0),
      estimates_app_value_mtd: portfolio.primary_demand_kind === 'estimates' ? appDemandValue : 0,
      estimates_app_count_mtd: portfolio.primary_demand_kind === 'estimates' ? appDemandCount : 0,
      converted_order_value_mtd: portfolio.primary_demand_kind === 'orders' ? appDemandValue : 0,
      converted_order_count_mtd: portfolio.primary_demand_kind === 'orders' ? appDemandCount : 0,
      invoiced_app_value_mtd: appInvoiced,
      invoiced_app_count_mtd: 0,
      not_ordering_buyers: enabledNeverUsedRows.slice(0, 3).map((row) => {
        const name = String(row.name ?? 'Buyer');
        return {
          buyer_id: String(row.buyer_id ?? ''),
          name,
          initials: initials(name),
        };
      }),
      top_app_buyers_callout: assistedRows.slice(0, 3).map((row) => {
        const name = String(row.name ?? 'Buyer');
        return {
          buyer_id: String(row.buyer_id ?? ''),
          name,
          initials: initials(name),
          gmv: Number(row.invoice_value_90d ?? 0),
        };
      }),
      no_app_buyers: assistedRows.slice(0, 3).map((row) => {
        const name = String(row.name ?? 'Buyer');
        return {
          buyer_id: String(row.buyer_id ?? ''),
          name,
          initials: initials(name),
          offline_gmv: Number(row.invoice_value_90d ?? 0),
        };
      }),
      top_app_buyers_card: assistedRows.slice(0, 5).map((row) => {
        const name = String(row.name ?? 'Buyer');
        return {
          buyer_id: String(row.buyer_id ?? ''),
          name,
          initials: initials(name),
          city: '',
          gmv: Number(row.invoice_value_90d ?? 0),
          orders: 0,
        };
      }),
      top_locations: locations.slice(0, 5).map((row) => ({
        location_id: String(row.location_id ?? ''),
        name: String(row.name ?? 'Location'),
        app_orders: 0,
        app_gmv: Number(row.app_invoiced_sales_90d ?? row.app_demand_value_90d ?? 0),
        share_pct: itemValue(invoiceShare),
      })),
      refreshed_at: portfolio.as_of,
    },
  };
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('buyer_app_api'));
    if (!init?.status || (init.status >= 200 && init.status < 300)) {
      response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    }
    return response;
  };

  try {
    const claims = await getVerifiedClaims(request);

    if (!claims.tenant_id || !claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    const flagEnabled = await getFlag(FEATURE_FLAGS.BUYER_APP, claims.tenant_id);
    if (!flagEnabled) {
      return timedJson({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return timedJson({ error: 'Server configuration error' }, { status: 500 });
    }

    const period = getSellerLandingPeriodMeta('month');
    const db = supabaseAdmin as any;
    const locationScope = getSellerLocationScope({
      role: claims.role ?? null,
      location_ids: claims.location_ids ?? null,
    });

    if (locationScope.mode === 'none') {
      return timedJson(emptyResponse(period));
    }

    const { data, error } = await db
      .schema('app')
      .rpc('get_metrics_v2_buyer_app_dashboard', {
        p_tenant_id: claims.tenant_id,
        p_role: claims.role ?? null,
        p_location_ids: locationScope.mode === 'subset' ? locationScope.locationIds : null,
      });

    if (error) {
      console.error('[GET /api/tenant/buyer-app] get_metrics_v2_buyer_app_dashboard failed', error);
      return timedJson({ error: 'Failed to load buyer app data' }, { status: 500 });
    }

    const portfolio = normalizePortfolio(data);
    return timedJson(portfolio ? portfolioToResponse(period, portfolio) : emptyResponse(period));
  } catch (error) {
    console.error('[GET /api/tenant/buyer-app]', error);
    return timedJson({ error: 'Failed to load buyer app data' }, { status: 500 });
  }
}
