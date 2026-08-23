import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

// Dependency graph confirmed by reading each RPC's body (which tables it
// reads/writes): the first 5 are mutually independent -- none reads a table
// another one writes. Only reco_suggest_bundles depends on the output of
// reco_compute_category_associations (app.reco_category_associations) and
// reco_compute_category_profiles (app.reco_category_profiles), so it must
// run after those two complete. This is a 2-stage pipeline, not 6 sequential
// steps.
const RECO_REFRESH_PARALLEL_RPCS: Array<{
  name: string;
  args: Record<string, unknown>;
}> = [
  { name: 'reco_compute_popularity', args: {} },
  { name: 'reco_compute_associations', args: { p_window_days: 90 } },
  { name: 'reco_refresh_buyer_profiles', args: {} },
  { name: 'reco_compute_category_profiles', args: {} },
  { name: 'reco_compute_category_associations', args: { p_window_days: 90 } },
];

const RECO_REFRESH_FINAL_RPC = { name: 'reco_suggest_bundles', args: {} as Record<string, unknown> };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const claims = await getVerifiedClaims(req);
  if (!claims.tenant_id) return jsonError(401, 'Unauthorized');
  if (claims.role !== 'seller_admin') return jsonError(403, 'Forbidden');
  if (!supabaseAdmin) return jsonError(500, 'Server configuration error');

  const db = supabaseAdmin as unknown as {
    schema: (name: string) => {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };

  const tenantId = claims.tenant_id;

  const results = await Promise.all(
    RECO_REFRESH_PARALLEL_RPCS.map((step) =>
      db.schema('app').rpc(step.name, { p_tenant_id: tenantId, ...step.args }).then((res) => ({ step, res })),
    ),
  );
  for (const { step, res } of results) {
    if (res.error) {
      console.error(`[POST /api/tenant/reco/refresh] ${step.name}`, res.error);
      return jsonError(500, `Refresh failed at ${step.name}: ${res.error.message}`);
    }
  }

  const { error: bundlesError } = await db
    .schema('app')
    .rpc(RECO_REFRESH_FINAL_RPC.name, { p_tenant_id: tenantId, ...RECO_REFRESH_FINAL_RPC.args });
  if (bundlesError) {
    console.error(`[POST /api/tenant/reco/refresh] ${RECO_REFRESH_FINAL_RPC.name}`, bundlesError);
    return jsonError(500, `Refresh failed at ${RECO_REFRESH_FINAL_RPC.name}: ${bundlesError.message}`);
  }

  return NextResponse.json({ ok: true });
}
