import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const claims = await getVerifiedClaims(req);
  if (!claims.tenant_id) return jsonError(401, 'Unauthorized');
  if (!claims.role?.startsWith('seller_')) return jsonError(403, 'Forbidden');
  if (!supabaseAdmin) return jsonError(500, 'Server configuration error');

  const { data, error } = await (supabaseAdmin as any)
    .schema('app')
    .rpc('reco_get_category_roles', { p_tenant_id: claims.tenant_id });

  if (error) {
    console.error('[GET /api/tenant/reco/categories]', error);
    return jsonError(500, error.message);
  }

  return NextResponse.json({ categories: data ?? [] });
}
