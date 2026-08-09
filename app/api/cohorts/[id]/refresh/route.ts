import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { getPostHogClient } from '@/lib/posthog-server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const claims = await getVerifiedClaims(request);
  if (!claims || !claims.role || !claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['seller_admin', 'seller_assistant'].includes(claims.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const enabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!enabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

  const db = supabaseAdmin;
  if (!db) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  // Verify the cohort belongs to this tenant and is rule-based
  const { data: cohort, error: cohortError } = await db
    .schema('app')
    .from('cohorts')
    .select('id, tenant_id, is_static, deleted_at')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .single();

  if (cohortError || !cohort) {
    return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
  }

  if (cohort.is_static) {
    return NextResponse.json({ error: 'Static cohorts do not need refresh' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcError } = await (db as any).rpc('refresh_cohort_by_id', { p_cohort_id: id });
  if (rpcError) {
    console.error('[POST /api/cohorts/[id]/refresh]', rpcError.message);
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }

  // Return updated count + timestamp
  const { data: updated } = await db
    .schema('app')
    .from('cohorts')
    .select('cached_member_count, last_refreshed_at')
    .eq('id', id)
    .single();

  getPostHogClient()?.capture({
    distinctId: claims.sub ?? claims.tenant_id,
    event: 'customer_group_refreshed',
    properties: {
      tenant_id: claims.tenant_id,
      seller_id: claims.sub,
      cohort_id: id,
      cached_member_count: updated?.cached_member_count ?? null,
      last_refreshed_at: (updated as any)?.last_refreshed_at ?? null,
      role: claims.role,
    },
  });

  return NextResponse.json({
    ok: true,
    cached_member_count: updated?.cached_member_count ?? null,
    last_refreshed_at: (updated as any)?.last_refreshed_at ?? null,
  });
}
