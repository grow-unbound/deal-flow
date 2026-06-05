import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { getCohortComposerPayload } from '@/lib/server/cohort-composer';

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

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const payload = await getCohortComposerPayload(supabaseAdmin as any, claims.tenant_id);
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('[GET /api/cohorts/composer]', error?.code, error?.message);
    return NextResponse.json({ error: 'Failed to load cohort composer' }, { status: 500 });
  }
}
