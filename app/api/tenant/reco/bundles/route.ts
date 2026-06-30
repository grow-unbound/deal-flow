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

  const db = supabaseAdmin as any;

  const { data: bundles, error } = await db
    .schema('app')
    .from('reco_bundles')
    .select(`
      id, name, description, is_active, source, created_at,
      reco_bundle_slots (
        id, tenant_category_id, slot_label, is_required, display_order
      )
    `)
    .eq('tenant_id', claims.tenant_id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET /api/tenant/reco/bundles]', error);
    return jsonError(500, error.message);
  }

  // Hydrate category names
  const allCategoryIds = Array.from(
    new Set((bundles ?? []).flatMap((b: any) => (b.reco_bundle_slots ?? []).map((s: any) => s.tenant_category_id))),
  );
  let categoryNames: Record<string, string> = {};
  if (allCategoryIds.length > 0) {
    const { data: cats } = await db
      .schema('app')
      .from('tenant_categories')
      .select('id, name')
      .in('id', allCategoryIds)
      .eq('tenant_id', claims.tenant_id);
    categoryNames = Object.fromEntries((cats ?? []).map((c: any) => [c.id, c.name]));
  }

  const enriched = (bundles ?? []).map((b: any) => ({
    ...b,
    slots: (b.reco_bundle_slots ?? [])
      .sort((a: any, z: any) => a.display_order - z.display_order)
      .map((s: any) => ({ ...s, category_name: categoryNames[s.tenant_category_id] ?? null })),
  }));

  return NextResponse.json({ bundles: enriched });
}

export async function POST(req: NextRequest) {
  const claims = await getVerifiedClaims(req);
  if (!claims.tenant_id) return jsonError(401, 'Unauthorized');
  if (claims.role !== 'seller_admin') return jsonError(403, 'Forbidden');
  if (!supabaseAdmin) return jsonError(500, 'Server configuration error');

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return jsonError(400, 'name is required');

  const db = supabaseAdmin as any;

  const { data: bundle, error: bundleErr } = await db
    .schema('app')
    .from('reco_bundles')
    .insert({
      tenant_id: claims.tenant_id,
      name: body.name.trim(),
      description: body.description ?? null,
      source: 'manual',
      is_active: true,
      created_by: claims.sub,
    })
    .select('id')
    .single();

  if (bundleErr) {
    console.error('[POST /api/tenant/reco/bundles]', bundleErr);
    if (bundleErr.code === '23505') return jsonError(409, 'A bundle with this name already exists');
    return jsonError(500, bundleErr.message);
  }

  // Optionally create slots inline
  const slots: { tenant_category_id: string; slot_label?: string; is_required?: boolean; display_order?: number }[] =
    Array.isArray(body.slots) ? body.slots : [];

  if (slots.length > 0) {
    const slotRows = slots.map((s, idx) => ({
      bundle_id: bundle.id,
      tenant_category_id: s.tenant_category_id,
      slot_label: s.slot_label ?? null,
      is_required: s.is_required ?? true,
      display_order: s.display_order ?? idx,
    }));
    const { error: slotsErr } = await db.schema('app').from('reco_bundle_slots').insert(slotRows);
    if (slotsErr) {
      console.error('[POST /api/tenant/reco/bundles] slots', slotsErr);
      return jsonError(500, slotsErr.message);
    }
  }

  return NextResponse.json({ ok: true, bundle_id: bundle.id }, { status: 201 });
}
