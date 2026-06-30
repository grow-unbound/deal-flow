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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.is_active !== undefined) patch.is_active = body.is_active;

  const { error } = await (supabaseAdmin as any)
    .schema('app')
    .from('reco_bundles')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id);

  if (error) {
    console.error('[PATCH /api/tenant/reco/bundles/[id]]', error);
    if (error.code === '23505') return jsonError(409, 'A bundle with this name already exists');
    return jsonError(500, error.message);
  }

  return NextResponse.json({ ok: true });
}

// Deactivate (soft delete) — never hard-delete business configuration
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getVerifiedClaims(req);
  if (!claims.tenant_id) return jsonError(401, 'Unauthorized');
  if (claims.role !== 'seller_admin') return jsonError(403, 'Forbidden');
  if (!supabaseAdmin) return jsonError(500, 'Server configuration error');

  const { id } = await params;

  const { error } = await (supabaseAdmin as any)
    .schema('app')
    .from('reco_bundles')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id);

  if (error) {
    console.error('[DELETE /api/tenant/reco/bundles/[id]]', error);
    return jsonError(500, error.message);
  }

  return NextResponse.json({ ok: true });
}
