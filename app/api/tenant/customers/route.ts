import { NextRequest } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { PAGE_SIZE } from '@/lib/pagination';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { readArrayParam } from '@/lib/landing-filter-params';

type CustomerCalloutId = 'needs_call' | 'win_back';

function decodeCursor(cursor: string | null): { business_name: string; id: string } | null {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { n?: string; i?: string };
    if (!parsed.n || !parsed.i) return null;
    return { business_name: parsed.n, id: parsed.i };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: unknown): string | null {
  if (!cursor || typeof cursor !== 'object') return null;
  const parsed = cursor as { n?: unknown; i?: unknown };
  if (typeof parsed.n !== 'string' || typeof parsed.i !== 'string') return null;
  return Buffer.from(JSON.stringify({ n: parsed.n, i: parsed.i })).toString('base64url');
}

function readCalloutParam(callout: string | null): CustomerCalloutId | null {
  if (callout === 'needs_call' || callout === 'win_back') return callout;
  return null;
}

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

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;
    const isAssistant = claims.role === 'seller_assistant';
    const assistantLocationIds = isAssistant ? (claims.location_ids ?? []).filter(Boolean) : [];
    const limit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const decodedCursor = decodeCursor(req.nextUrl.searchParams.get('cursor'));
    const search = req.nextUrl.searchParams.get('search')?.trim() || null;
    const statusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const dueParams = readArrayParam(req.nextUrl.searchParams, 'due');
    const fullCalloutId = readCalloutParam(req.nextUrl.searchParams.get('callout')?.trim() || null);

    const { data, error } = await db
      .schema('app')
      .rpc('metrics_v2_customers_landing', {
        p_tenant_id: tenantId,
        p_location_ids: isAssistant ? assistantLocationIds : null,
        p_query: search,
        p_statuses: statusParams.length > 0 ? statusParams : null,
        p_dues: dueParams.length > 0 ? dueParams : null,
        p_limit: limit,
        p_cursor_name: decodedCursor?.business_name ?? null,
        p_cursor_id: decodedCursor?.id ?? null,
        p_full_callout: fullCalloutId,
      });

    if (error) {
      console.error('[GET /api/tenant/customers] metrics_v2_customers_landing failed', error);
      return timedJson({ error: 'Failed to fetch customers landing data' }, { status: 500 });
    }

    const payload = (data ?? {}) as Record<string, unknown>;

    return timedJson({
      ...payload,
      nextCursor: encodeCursor(payload.nextCursor),
    });
  } catch (error) {
    console.error('[GET /api/tenant/customers] unexpected error', error);
    return timedJson({ error: 'Unexpected server error' }, { status: 500 });
  }
}
