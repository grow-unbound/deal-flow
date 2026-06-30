import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

async function assertBundleOwnership(db: any, bundleId: string, tenantId: string): Promise<boolean> {
  const { data } = await db
    .schema('app')
    .from('reco_bundles')
    .select('id')
    .eq('id', bundleId)
    .eq('tenant_id', tenantId)
    .single();
  return Boolean(data);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getVerifiedClaims(req);
  if (!claims.tenant_id) return jsonError(401, 'Unauthorized');
  if (!claims.role?.startsWith('seller_')) return jsonError(403, 'Forbidden');
  if (!supabaseAdmin) return jsonError(500, 'Server configuration error');

  const { id } = await params;
  const db = supabaseAdmin as any;

  if (!(await assertBundleOwnership(db, id, claims.tenant_id))) return jsonError(404, 'Bundle not found');

  const { data, error } = await db
    .schema('app')
    .from('reco_bundle_slots')
    .select('id, tenant_category_id, slot_label, is_required, display_order')
    .eq('bundle_id', id)
    .order('display_order');

  if (error) return jsonError(500, error.message);
  return NextResponse.json({ slots: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getVerifiedClaims(req);
  if (!claims.tenant_id) return jsonError(401, 'Unauthorized');
  if (claims.role !== 'seller_admin') return jsonError(403, 'Forbidden');
  if (!supabaseAdmin) return jsonError(500, 'Server configuration error');

  const { id } = await params;
  const db = supabaseAdmin as any;

  if (!(await assertBundleOwnership(db, id, claims.tenant_id))) return jsonError(404, 'Bundle not found');

  const body = await req.json().catch(() => null);
  if (!body?.tenant_category_id) return jsonError(400, 'tenant_category_id is required');

  const { data, error } = await db
    .schema('app')
    .from('reco_bundle_slots')
    .insert({
      bundle_id: id,
      tenant_category_id: body.tenant_category_id,
      slot_label: body.slot_label ?? null,
      is_required: body.is_required ?? true,
      display_order: body.display_order ?? 0,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return jsonError(409, 'This category is already a slot in this bundle');
    return jsonError(500, error.message);
  }

  return NextResponse.json({ ok: true, slot_id: data.id }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getVerifiedClaims(req);
  if (!claims.tenant_id) return jsonError(401, 'Unauthorized');
  if (claims.role !== 'seller_admin') return jsonError(403, 'Forbidden');
  if (!supabaseAdmin) return jsonError(500, 'Server configuration error');

  const { id } = await params;
  const slotId = req.nextUrl.searchParams.get('slot_id');
  if (!slotId) return jsonError(400, 'slot_id query param is required');

  const db = supabaseAdmin as any;
  if (!(await assertBundleOwnership(db, id, claims.tenant_id))) return jsonError(404, 'Bundle not found');

  const { error } = await db
    .schema('app')
    .from('reco_bundle_slots')
    .delete()
    .eq('id', slotId)
    .eq('bundle_id', id);

  if (error) return jsonError(500, error.message);
  return NextResponse.json({ ok: true });
}
