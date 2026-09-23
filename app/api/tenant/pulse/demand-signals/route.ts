import { NextRequest } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming } from '@/lib/server/bounded-get';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';
import {
  demandSignalsResponseFromSnapshot,
  PULSE_DEMAND_SIGNALS_PAGE_KEY,
  PULSE_DEMAND_SIGNALS_PERIOD_KEY,
} from '@/lib/server/pulse-demand-signals';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) =>
    jsonWithServerTiming(body, timer, 'pulse_demand_signals_api', init, APP_GET_CACHE_CONTROL);

  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return timedJson({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return timedJson({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

  const { data, error } = await supabaseAdmin.schema('app').rpc('get_landing_metrics_v4', {
    p_tenant_id: claims.tenant_id,
    p_page_key: PULSE_DEMAND_SIGNALS_PAGE_KEY,
    p_period_key: PULSE_DEMAND_SIGNALS_PERIOD_KEY,
    p_scope_kind: 'tenant',
    p_scope_id: null,
    p_as_of: new Date().toISOString(),
  });

  if (error) {
    console.error('[GET /api/tenant/pulse/demand-signals] get_landing_metrics_v4 failed', error);
    return timedJson({ error: 'Failed to load Pulse demand signals' }, { status: 500 });
  }

  return timedJson(demandSignalsResponseFromSnapshot(data));
}
