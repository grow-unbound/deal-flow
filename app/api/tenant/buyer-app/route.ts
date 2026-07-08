import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getFlag } from '@/lib/flags';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { FEATURE_FLAGS } from '@/constants';
import { SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { getSellerLocationScope } from '@/lib/server/seller-location-access';
import { createTimer } from '@/lib/server-timing';
import type { BuyerAppLandingResponse } from '@/hooks/useBuyerApp';

type BuyerAppSnapshotRow = Record<string, unknown> | null;

function normalizeSnapshot(snapshot: BuyerAppSnapshotRow): BuyerAppLandingResponse['snapshot'] {
  if (!snapshot) return null;

  return {
    enabled_buyers: Number(snapshot.enabled_buyers ?? 0),
    total_buyers: Number(snapshot.total_buyers ?? 0),
    opened_app_mtd: Number(snapshot.opened_app_mtd ?? 0),
    ordered_mtd: Number(snapshot.ordered_mtd ?? 0),
    repeat_mtd: Number(snapshot.repeat_mtd ?? 0),
    app_gmv_mtd: Number(snapshot.app_gmv_mtd ?? 0),
    app_orders_mtd: Number(snapshot.app_orders_mtd ?? 0),
    total_gmv_mtd: Number(snapshot.total_gmv_mtd ?? 0),
    estimates_app_value_mtd: Number(snapshot.estimates_app_value_mtd ?? 0),
    estimates_app_count_mtd: Number(snapshot.estimates_app_count_mtd ?? 0),
    converted_order_value_mtd: Number(snapshot.converted_order_value_mtd ?? 0),
    converted_order_count_mtd: Number(snapshot.converted_order_count_mtd ?? 0),
    invoiced_app_value_mtd: Number(snapshot.invoiced_app_value_mtd ?? 0),
    invoiced_app_count_mtd: Number(snapshot.invoiced_app_count_mtd ?? 0),
    not_ordering_buyers: Array.isArray(snapshot.not_ordering_buyers) ? snapshot.not_ordering_buyers as any[] : [],
    top_app_buyers_callout: Array.isArray(snapshot.top_app_buyers_callout) ? snapshot.top_app_buyers_callout as any[] : [],
    no_app_buyers: Array.isArray(snapshot.no_app_buyers) ? snapshot.no_app_buyers as any[] : [],
    top_app_buyers_card: Array.isArray(snapshot.top_app_buyers_card) ? snapshot.top_app_buyers_card as any[] : [],
    top_locations: Array.isArray(snapshot.top_locations) ? snapshot.top_locations as any[] : [],
    refreshed_at: typeof snapshot.refreshed_at === 'string' ? snapshot.refreshed_at : new Date().toISOString(),
  };
}

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

function distinctEnabledBuyerCount(
  rows: Array<{ buyer_id: string | null }> | null | undefined,
  enabledBuyerIds: Set<string>,
) {
  const distinctBuyerIds = new Set<string>();

  for (const row of rows ?? []) {
    if (!row.buyer_id || !enabledBuyerIds.has(row.buyer_id)) continue;
    distinctBuyerIds.add(row.buyer_id);
  }

  return distinctBuyerIds.size;
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

    const period = getSellerLandingPeriodMeta(request.nextUrl.searchParams.get('period'));
    const monthPeriod = getSellerLandingPeriodMeta('month');
    const db = supabaseAdmin as any;
    const locationScope = getSellerLocationScope({
      role: claims.role ?? null,
      location_ids: claims.location_ids ?? null,
    });

    if (locationScope.mode === 'none') {
      return timedJson(emptyResponse(period));
    }

    const applyLocationScope = <T extends { in: (column: string, values: string[]) => T }>(
      query: T,
      column = 'location_id',
    ) => {
      if (locationScope.mode === 'subset') {
        return query.in(column, locationScope.locationIds);
      }
      return query;
    };

    if (locationScope.mode === 'all') {
      const [dailyResult, snapshotResult, enabledBuyersResult, activityResult] = await Promise.all([
        db
          .schema('app')
          .from('kpi_buyer_app_daily')
          .select('*')
          .eq('tenant_id', claims.tenant_id)
          .gte('snapshot_date', period.current_start.split('T')[0])
          .lt('snapshot_date', period.current_end_exclusive.split('T')[0]),
        db
          .schema('app')
          .from('buyer_app_snapshot')
          .select('*')
          .eq('tenant_id', claims.tenant_id)
          .maybeSingle(),
        db
          .schema('app')
          .from('buyers')
          .select('id')
          .eq('tenant_id', claims.tenant_id)
          .eq('is_active', true)
          .eq('buyer_app_enabled', true)
          .is('deleted_at', null),
        db
          .schema('app')
          .from('buyer_app_activity')
          .select('buyer_id')
          .eq('tenant_id', claims.tenant_id)
          .eq('qualifies_for_engagement', true)
          .is('deleted_at', null)
          .gte('occurred_day', period.current_start.split('T')[0])
          .lt('occurred_day', period.current_end_exclusive.split('T')[0]),
      ]);

      if (dailyResult.error || snapshotResult.error || enabledBuyersResult.error || activityResult.error) {
        throw dailyResult.error ?? snapshotResult.error ?? enabledBuyersResult.error ?? activityResult.error;
      }

      const dailyRows = (dailyResult.data ?? []) as Array<{
        app_gmv?: number | null;
        app_orders?: number | null;
        app_estimates_value?: number | null;
        app_estimates_count?: number | null;
        converted_to_order_value?: number | null;
        converted_to_order_count?: number | null;
        invoiced_value?: number | null;
        invoiced_count?: number | null;
      }>;
      let snapshot = snapshotResult.data ?? null;

      if (!snapshot) {
        await db.schema('app').rpc('refresh_buyer_app_snapshot', { p_tenant_id: claims.tenant_id });
        const seeded = await db
          .schema('app')
          .from('buyer_app_snapshot')
          .select('*')
          .eq('tenant_id', claims.tenant_id)
          .maybeSingle();
        snapshot = seeded.data ?? null;
      }

      const enabledBuyerIds = new Set(
        ((enabledBuyersResult.data ?? []) as Array<{ id: string }>).map((buyer) => buyer.id),
      );

      const normalizedSnapshot = normalizeSnapshot(snapshot);
      const kpis = dailyRows.reduce<BuyerAppLandingResponse['kpis']>(
        (acc, row) => ({
          enabled_buyers: normalizedSnapshot?.enabled_buyers ?? 0,
          total_buyers: normalizedSnapshot?.total_buyers ?? 0,
          app_gmv: acc.app_gmv + Number(row.app_gmv ?? 0),
          app_orders: acc.app_orders + Number(row.app_orders ?? 0),
          active_buyers: 0,
          app_estimates_value: acc.app_estimates_value + Number(row.app_estimates_value ?? 0),
          app_estimates_count: acc.app_estimates_count + Number(row.app_estimates_count ?? 0),
          converted_to_order_value: acc.converted_to_order_value + Number(row.converted_to_order_value ?? 0),
          converted_to_order_count: acc.converted_to_order_count + Number(row.converted_to_order_count ?? 0),
          invoiced_value: acc.invoiced_value + Number(row.invoiced_value ?? 0),
          invoiced_count: acc.invoiced_count + Number(row.invoiced_count ?? 0),
        }),
        {
          enabled_buyers: normalizedSnapshot?.enabled_buyers ?? 0,
          total_buyers: normalizedSnapshot?.total_buyers ?? 0,
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
      );

      kpis.active_buyers = distinctEnabledBuyerCount(
        activityResult.data as Array<{ buyer_id: string | null }> | null | undefined,
        enabledBuyerIds,
      );

      return timedJson({
        period,
        kpis,
        snapshot: normalizedSnapshot,
      } satisfies BuyerAppLandingResponse);
    }

    const [scopedBuyerSnapshotResult, scopedBuyersResult] = await Promise.all([
      db
        .schema('app')
        .from('buyers_snapshot')
        .select('buyer_id')
        .eq('tenant_id', claims.tenant_id)
        .eq('scope', 'location')
        .in('location_id', locationScope.locationIds),
      db
        .schema('app')
        .from('buyers')
        .select('id, business_name, geography, buyer_app_enabled')
        .eq('tenant_id', claims.tenant_id)
        .eq('is_active', true)
        .is('deleted_at', null),
    ]);

    if (scopedBuyerSnapshotResult.error || scopedBuyersResult.error) {
      throw scopedBuyerSnapshotResult.error ?? scopedBuyersResult.error;
    }

    const accessibleBuyerIds = new Set(
      ((scopedBuyerSnapshotResult.data ?? []) as Array<{ buyer_id: string | null }>)
        .map((row) => row.buyer_id)
        .filter((buyerId): buyerId is string => typeof buyerId === 'string' && buyerId.length > 0),
    );

    const scopedBuyers = ((scopedBuyersResult.data ?? []) as Array<Record<string, unknown>>)
      .filter((buyer) => accessibleBuyerIds.has(String(buyer.id)));

    if (scopedBuyers.length === 0) {
      return timedJson(emptyResponse(period));
    }

    const [periodOrdersResult, periodEstimatesResult, periodInvoicesResult, periodActivityResult, monthOrdersResult, monthAllOrdersResult, monthActivityResult, monthEstimatesResult, monthInvoicesResult] = await Promise.all([
      applyLocationScope(
        db
          .schema('app')
          .from('orders')
          .select('buyer_id, location_id, total_amount, placed_at')
          .eq('tenant_id', claims.tenant_id)
          .eq('is_buyer_app_order', true)
          .is('deleted_at', null)
          .gte('placed_at', period.current_start)
          .lt('placed_at', period.current_end_exclusive),
      ),
      applyLocationScope(
        db
          .schema('app')
          .from('estimates')
          .select('buyer_id, location_id, total_amount')
          .eq('tenant_id', claims.tenant_id)
          .eq('is_buyer_app_estimate', true)
          .is('deleted_at', null)
          .gte('estimate_date', period.current_start)
          .lt('estimate_date', period.current_end_exclusive),
      ),
      applyLocationScope(
        db
          .schema('app')
          .from('invoices')
          .select('buyer_id, location_id, total_amount')
          .eq('tenant_id', claims.tenant_id)
          .eq('is_buyer_app_invoice', true)
          .is('deleted_at', null)
          .gte('invoice_date', period.current_start)
          .lt('invoice_date', period.current_end_exclusive),
      ),
      applyLocationScope(
        db
          .schema('app')
          .from('buyer_app_activity')
          .select('buyer_id, location_id')
          .eq('tenant_id', claims.tenant_id)
          .eq('qualifies_for_engagement', true)
          .is('deleted_at', null)
          .gte('occurred_day', period.current_start.split('T')[0])
          .lt('occurred_day', period.current_end_exclusive.split('T')[0]),
      ),
      applyLocationScope(
        db
          .schema('app')
          .from('orders')
          .select('buyer_id, location_id, total_amount, placed_at')
          .eq('tenant_id', claims.tenant_id)
          .eq('is_buyer_app_order', true)
          .is('deleted_at', null)
          .gte('placed_at', monthPeriod.current_start)
          .lt('placed_at', monthPeriod.current_end_exclusive),
      ),
      applyLocationScope(
        db
          .schema('app')
          .from('orders')
          .select('buyer_id, location_id, total_amount')
          .eq('tenant_id', claims.tenant_id)
          .is('deleted_at', null)
          .gte('placed_at', monthPeriod.current_start)
          .lt('placed_at', monthPeriod.current_end_exclusive),
      ),
      applyLocationScope(
        db
          .schema('app')
          .from('buyer_app_activity')
          .select('buyer_id, location_id')
          .eq('tenant_id', claims.tenant_id)
          .eq('qualifies_for_engagement', true)
          .is('deleted_at', null)
          .gte('occurred_day', monthPeriod.current_start.split('T')[0])
          .lt('occurred_day', monthPeriod.current_end_exclusive.split('T')[0]),
      ),
      applyLocationScope(
        db
          .schema('app')
          .from('estimates')
          .select('buyer_id, location_id, total_amount')
          .eq('tenant_id', claims.tenant_id)
          .eq('is_buyer_app_estimate', true)
          .is('deleted_at', null)
          .gte('estimate_date', monthPeriod.current_start)
          .lt('estimate_date', monthPeriod.current_end_exclusive),
      ),
      applyLocationScope(
        db
          .schema('app')
          .from('invoices')
          .select('buyer_id, location_id, total_amount')
          .eq('tenant_id', claims.tenant_id)
          .eq('is_buyer_app_invoice', true)
          .is('deleted_at', null)
          .gte('invoice_date', monthPeriod.current_start)
          .lt('invoice_date', monthPeriod.current_end_exclusive),
      ),
    ]);

    if (
      periodOrdersResult.error
      || periodEstimatesResult.error
      || periodInvoicesResult.error
      || periodActivityResult.error
      || monthOrdersResult.error
      || monthAllOrdersResult.error
      || monthActivityResult.error
      || monthEstimatesResult.error
      || monthInvoicesResult.error
    ) {
      throw periodOrdersResult.error
        ?? periodEstimatesResult.error
        ?? periodInvoicesResult.error
        ?? periodActivityResult.error
        ?? monthOrdersResult.error
        ?? monthAllOrdersResult.error
        ?? monthActivityResult.error
        ?? monthEstimatesResult.error
        ?? monthInvoicesResult.error;
    }

    const enabledBuyerIds = new Set(
      scopedBuyers
        .filter((buyer) => Boolean(buyer.buyer_app_enabled))
        .map((buyer) => String(buyer.id)),
    );

    const periodOrders = (periodOrdersResult.data ?? []) as Array<{ buyer_id: string | null; location_id: string | null; total_amount: number | null; placed_at: string | null }>;
    const periodEstimates = (periodEstimatesResult.data ?? []) as Array<{ buyer_id: string | null; location_id: string | null; total_amount: number | null }>;
    const periodInvoices = (periodInvoicesResult.data ?? []) as Array<{ buyer_id: string | null; location_id: string | null; total_amount: number | null }>;
    const monthOrders = (monthOrdersResult.data ?? []) as Array<{ buyer_id: string | null; location_id: string | null; total_amount: number | null; placed_at: string | null }>;
    const monthAllOrders = (monthAllOrdersResult.data ?? []) as Array<{ buyer_id: string | null; location_id: string | null; total_amount: number | null }>;
    const monthEstimates = (monthEstimatesResult.data ?? []) as Array<{ buyer_id: string | null; location_id: string | null; total_amount: number | null }>;
    const monthInvoices = (monthInvoicesResult.data ?? []) as Array<{ buyer_id: string | null; location_id: string | null; total_amount: number | null }>;

    const ordersByBuyer = new Map<string, { orders: number; gmv: number }>();
    for (const order of monthOrders) {
      if (!order.buyer_id || !enabledBuyerIds.has(order.buyer_id)) continue;
      const entry = ordersByBuyer.get(order.buyer_id) ?? { orders: 0, gmv: 0 };
      entry.orders += 1;
      entry.gmv += Number(order.total_amount ?? 0);
      ordersByBuyer.set(order.buyer_id, entry);
    }

    const totalAppGmv = periodOrders.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const totalAppEstimateValue = periodEstimates.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const totalInvoicedValue = periodInvoices.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const totalScopedGmvMtd = monthAllOrders.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);

    const buyerDirectory = new Map(
      scopedBuyers.map((buyer) => [
        String(buyer.id),
        {
          name: String(buyer.business_name ?? 'Buyer'),
          city: String((buyer.geography as Record<string, unknown> | null)?.city ?? ''),
        },
      ]),
    );

    const topBuyers = [...ordersByBuyer.entries()]
      .sort((a, b) => b[1].gmv - a[1].gmv)
      .slice(0, 5);

    const topLocationsMap = new Map<string, { app_orders: number; app_gmv: number }>();
    for (const order of monthOrders) {
      if (!order.location_id) continue;
      const entry = topLocationsMap.get(order.location_id) ?? { app_orders: 0, app_gmv: 0 };
      entry.app_orders += 1;
      entry.app_gmv += Number(order.total_amount ?? 0);
      topLocationsMap.set(order.location_id, entry);
    }

    const scopedLocationNamesResult = await db
      .schema('app')
      .from('locations')
      .select('id, name')
      .eq('tenant_id', claims.tenant_id)
      .in('id', locationScope.locationIds);

    const locationNames = new Map(
      ((scopedLocationNamesResult.data ?? []) as Array<{ id: string; name: string }>).map((location) => [location.id, location.name]),
    );

    const response: BuyerAppLandingResponse = {
      period,
      kpis: {
        enabled_buyers: enabledBuyerIds.size,
        total_buyers: scopedBuyers.length,
        app_gmv: totalAppGmv,
        app_orders: periodOrders.length,
        active_buyers: distinctEnabledBuyerCount(
          periodActivityResult.data as Array<{ buyer_id: string | null }> | null | undefined,
          enabledBuyerIds,
        ),
        app_estimates_value: totalAppEstimateValue,
        app_estimates_count: periodEstimates.length,
        converted_to_order_value: totalAppGmv,
        converted_to_order_count: periodOrders.length,
        invoiced_value: totalInvoicedValue,
        invoiced_count: periodInvoices.length,
      },
      snapshot: {
        enabled_buyers: enabledBuyerIds.size,
        total_buyers: scopedBuyers.length,
        opened_app_mtd: distinctEnabledBuyerCount(
          monthActivityResult.data as Array<{ buyer_id: string | null }> | null | undefined,
          enabledBuyerIds,
        ),
        ordered_mtd: new Set(
          monthOrders
            .map((order) => order.buyer_id)
            .filter((buyerId): buyerId is string => Boolean(buyerId) && enabledBuyerIds.has(buyerId as string)),
        ).size,
        repeat_mtd: [...ordersByBuyer.values()].filter((entry) => entry.orders >= 2).length,
        app_gmv_mtd: monthOrders.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
        app_orders_mtd: monthOrders.length,
        total_gmv_mtd: totalScopedGmvMtd,
        estimates_app_value_mtd: monthEstimates.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
        estimates_app_count_mtd: monthEstimates.length,
        converted_order_value_mtd: monthOrders.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
        converted_order_count_mtd: monthOrders.length,
        invoiced_app_value_mtd: monthInvoices.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
        invoiced_app_count_mtd: monthInvoices.length,
        not_ordering_buyers: [],
        top_app_buyers_callout: topBuyers.map(([buyerId, stats]) => ({
          buyer_id: buyerId,
          name: buyerDirectory.get(buyerId)?.name ?? 'Buyer',
          initials: (buyerDirectory.get(buyerId)?.name ?? 'Buyer')
            .split(' ')
            .map((part) => part[0] ?? '')
            .join('')
            .slice(0, 2)
            .toUpperCase(),
          gmv: stats.gmv,
          orders: stats.orders,
        })),
        no_app_buyers: [],
        top_app_buyers_card: topBuyers.map(([buyerId, stats]) => ({
          buyer_id: buyerId,
          name: buyerDirectory.get(buyerId)?.name ?? 'Buyer',
          initials: (buyerDirectory.get(buyerId)?.name ?? 'Buyer')
            .split(' ')
            .map((part) => part[0] ?? '')
            .join('')
            .slice(0, 2)
            .toUpperCase(),
          city: buyerDirectory.get(buyerId)?.city ?? '',
          gmv: stats.gmv,
          orders: stats.orders,
        })),
        top_locations: [...topLocationsMap.entries()]
          .sort((a, b) => b[1].app_gmv - a[1].app_gmv)
          .slice(0, 5)
          .map(([locationId, stats]) => ({
            location_id: locationId,
            name: locationNames.get(locationId) ?? 'Location',
            app_orders: stats.app_orders,
            app_gmv: stats.app_gmv,
            share_pct: totalScopedGmvMtd > 0 ? Math.round((stats.app_gmv / totalScopedGmvMtd) * 100) : null,
          })),
        refreshed_at: new Date().toISOString(),
      },
    };

    return timedJson(response);
  } catch (error) {
    console.error('[GET /api/tenant/buyer-app]', error);
    return timedJson({ error: 'Failed to load buyer app data' }, { status: 500 });
  }
}
