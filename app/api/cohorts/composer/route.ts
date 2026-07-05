import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { getCohortComposerPayload } from '@/lib/server/cohort-composer';
import { getRequestSupabaseClient } from '@/lib/server/request-supabase';

export async function GET(_request: NextRequest) {
  const claims = await getVerifiedClaims(_request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  try {
    const db = supabaseAdmin ?? getRequestSupabaseClient();
    const payload = await getCohortComposerPayload(db as any, claims.tenant_id);
    return NextResponse.json(payload, { headers: SELLER_CACHE_PERSONAL });
  } catch (error: any) {
    console.error('[GET /api/cohorts/composer]', error?.code, error?.message);
    return NextResponse.json({ error: 'Failed to load cohort composer' }, { status: 500 });
  }
}
