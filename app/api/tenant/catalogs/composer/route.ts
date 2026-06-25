import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createTimer } from '@/lib/server-timing';
import { getCatalogComposerPayload } from '@/lib/server/catalog-composer';
import { getRequestSupabaseClient } from '@/lib/server/request-supabase';

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('catalogs_composer_api'));
    return response;
  };

  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return timedJson({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = supabaseAdmin ?? getRequestSupabaseClient();
    const payload = await getCatalogComposerPayload(db as any, claims.tenant_id);
    return timedJson(payload);
  } catch (error: any) {
    console.error('[GET /api/tenant/catalogs/composer] failed for tenant=%s code=%s message=%s', claims.tenant_id, error?.code ?? 'n/a', error?.message ?? String(error));
    return timedJson({ error: 'Failed to load catalog composer' }, { status: 500 });
  }
}
