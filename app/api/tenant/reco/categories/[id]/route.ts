import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getVerifiedClaims(req);
  if (!claims.tenant_id) return jsonError(401, 'Unauthorized');
  if (claims.role !== 'seller_admin') return jsonError(403, 'Forbidden');
  if (!supabaseAdmin) return jsonError(500, 'Server configuration error');

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, 'Invalid JSON');

  // recommendation_role: 'anchor' | 'companion' | 'exclude' | null (null = revert to auto)
  const role: string | null = body.recommendation_role ?? null;
  const validRoles = ['anchor', 'companion', 'exclude', null];
  if (!validRoles.includes(role)) {
    return jsonError(400, 'recommendation_role must be anchor, companion, exclude, or null');
  }

  const { error } = await (supabaseAdmin as any)
    .schema('app')
    .from('tenant_categories')
    .update({ recommendation_role: role, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id);

  if (error) {
    console.error('[PATCH /api/tenant/reco/categories/[id]]', error);
    return jsonError(500, error.message);
  }

  return NextResponse.json({ ok: true });
}
