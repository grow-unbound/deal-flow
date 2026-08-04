import { NextRequest } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { PAGE_SIZE } from '@/lib/pagination';
import { createTimer } from '@/lib/server-timing';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import {
  fetchCustomersLandingTable,
  parseCustomersFilterPreset,
  parseCustomersTableSort,
} from '@/lib/server/customers-landing-table';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    return jsonWithServerTiming(body, timer, 'customers_api', init, APP_GET_CACHE_CONTROL);
  };

  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return timedJson({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    const flagEnabled = await getFlag('df_customer_master', claims.tenant_id);
    if (!flagEnabled) {
      return timedJson({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return timedJson({ error: 'Server configuration error' }, { status: 500 });
    }

    const params = req.nextUrl.searchParams;
    const limit = parseRowsLimit(params.get('limit'), PAGE_SIZE.SELLER);
    const sort = parseCustomersTableSort(params.get('sort'));
    const filterPreset = parseCustomersFilterPreset(params.get('filter_preset'));
    const search = params.get('search')?.trim() || null;

    const payload = await fetchCustomersLandingTable(supabaseAdmin as never, {
      tenantId: claims.tenant_id,
      limit,
      cursor: params.get('cursor'),
      sort,
      search,
      filterPreset,
    });

    return timedJson(payload);
  } catch (error) {
    console.error('[GET /api/tenant/customers] unexpected error', error);
    return timedJson({ error: 'Unexpected server error' }, { status: 500 });
  }
}
