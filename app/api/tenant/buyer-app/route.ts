import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getFlag } from '@/lib/flags';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { FEATURE_FLAGS } from '@/constants';
import { createTimer } from '@/lib/server-timing';
import type { BuyerAppLandingResponse } from '@/hooks/useBuyerApp';

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('buyer_app_api'));
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
    const db = supabaseAdmin as any;

    const [dailyResult, snapshotResult] = await Promise.all([
      db
        .schema('app')
        .from('buyer_app_daily')
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
    ]);

    const dailyRows: Record<string, number>[] = dailyResult.data ?? [];
    const snap = snapshotResult.data ?? null;

    const kpis = dailyRows.reduce(
      (acc, row) => ({
        enabled_buyers: snap?.enabled_buyers ?? 0,
        total_buyers: snap?.total_buyers ?? 0,
        app_gmv: acc.app_gmv + Number(row.app_gmv ?? 0),
        app_orders: acc.app_orders + Number(row.app_orders ?? 0),
        active_buyers: acc.active_buyers + Number(row.active_buyers ?? 0),
        app_estimates_value: acc.app_estimates_value + Number(row.app_estimates_value ?? 0),
        app_estimates_count: acc.app_estimates_count + Number(row.app_estimates_count ?? 0),
        converted_to_order_value: acc.converted_to_order_value + Number(row.converted_to_order_value ?? 0),
        converted_to_order_count: acc.converted_to_order_count + Number(row.converted_to_order_count ?? 0),
        invoiced_value: acc.invoiced_value + Number(row.invoiced_value ?? 0),
        invoiced_count: acc.invoiced_count + Number(row.invoiced_count ?? 0),
      }),
      {
        enabled_buyers: snap?.enabled_buyers ?? 0,
        total_buyers: snap?.total_buyers ?? 0,
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

    // For month period, use snapshot's ordered_mtd for exact distinct count
    if (period.selected === 'month' && snap) {
      kpis.active_buyers = snap.ordered_mtd;
    }

    const response: BuyerAppLandingResponse = {
      period,
      kpis,
      snapshot: snap
        ? {
            enabled_buyers: Number(snap.enabled_buyers ?? 0),
            total_buyers: Number(snap.total_buyers ?? 0),
            opened_app_mtd: Number(snap.opened_app_mtd ?? 0),
            ordered_mtd: Number(snap.ordered_mtd ?? 0),
            repeat_mtd: Number(snap.repeat_mtd ?? 0),
            app_gmv_mtd: Number(snap.app_gmv_mtd ?? 0),
            app_orders_mtd: Number(snap.app_orders_mtd ?? 0),
            total_gmv_mtd: Number(snap.total_gmv_mtd ?? 0),
            estimates_app_value_mtd: Number(snap.estimates_app_value_mtd ?? 0),
            estimates_app_count_mtd: Number(snap.estimates_app_count_mtd ?? 0),
            converted_order_value_mtd: Number(snap.converted_order_value_mtd ?? 0),
            converted_order_count_mtd: Number(snap.converted_order_count_mtd ?? 0),
            invoiced_app_value_mtd: Number(snap.invoiced_app_value_mtd ?? 0),
            invoiced_app_count_mtd: Number(snap.invoiced_app_count_mtd ?? 0),
            not_ordering_buyers: snap.not_ordering_buyers ?? [],
            top_app_buyers_callout: snap.top_app_buyers_callout ?? [],
            no_app_buyers: snap.no_app_buyers ?? [],
            top_app_buyers_card: snap.top_app_buyers_card ?? [],
            top_locations: snap.top_locations ?? [],
            refreshed_at: snap.refreshed_at,
          }
        : null,
    };

    return timedJson(response);
  } catch (error) {
    console.error('[GET /api/tenant/buyer-app]', error);
    return timedJson({ error: 'Failed to load buyer app data' }, { status: 500 });
  }
}
