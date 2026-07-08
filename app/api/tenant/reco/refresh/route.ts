import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

const RECO_REFRESH_RPCS: Array<{
  name: string;
  args: Record<string, unknown>;
}> = [
  { name: 'reco_compute_popularity', args: {} },
  { name: 'reco_compute_associations', args: { p_window_days: 90 } },
  { name: 'reco_refresh_buyer_profiles', args: {} },
  { name: 'reco_compute_category_profiles', args: {} },
  { name: 'reco_compute_category_associations', args: { p_window_days: 90 } },
  { name: 'reco_suggest_bundles', args: {} },
];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const claims = await getVerifiedClaims(req);
  if (!claims.tenant_id) return jsonError(401, 'Unauthorized');
  if (claims.role !== 'seller_admin') return jsonError(403, 'Forbidden');
  if (!supabaseAdmin) return jsonError(500, 'Server configuration error');

  const db = supabaseAdmin as {
    schema: (name: string) => {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };

  const tenantId = claims.tenant_id;

  for (const step of RECO_REFRESH_RPCS) {
    const { error } = await db.schema('app').rpc(step.name, {
      p_tenant_id: tenantId,
      ...step.args,
    });
    if (error) {
      console.error(`[POST /api/tenant/reco/refresh] ${step.name}`, error);
      return jsonError(500, `Refresh failed at ${step.name}: ${error.message}`);
    }
  }

  return NextResponse.json({ ok: true });
}
