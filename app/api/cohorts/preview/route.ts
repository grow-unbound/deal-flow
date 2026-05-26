import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { CohortRulesSchema } from '@/lib/zod';

export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = CohortRulesSchema.safeParse((body as Record<string, unknown>)?.rules ?? body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid rules' }, { status: 422 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data, error } = await db.schema('app').rpc('preview_cohort_count', {
    p_tenant_id: claims.tenant_id,
    p_rules_json: { filters: parsed.data.filters },
  });

  if (error) {
    console.error('[POST /api/cohorts/preview]', error.message);
    return NextResponse.json({ error: 'Preview failed' }, { status: 500 });
  }

  const result = data as { count: number; sample_names: string[] } | null;
  return NextResponse.json({
    count: result?.count ?? 0,
    sample_names: result?.sample_names ?? [],
  });
}
