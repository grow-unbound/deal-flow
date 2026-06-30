import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

// PATCH { status: 'accepted' | 'rejected' }
// 'accepted' → creates a reco_bundles row + reco_bundle_slots for each category_id
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
  if (!body?.status || !['accepted', 'rejected'].includes(body.status)) {
    return jsonError(400, 'status must be accepted or rejected');
  }

  const db = supabaseAdmin as any;

  // Verify the suggestion belongs to this tenant
  const { data: suggestion, error: fetchErr } = await db
    .schema('app')
    .from('reco_bundle_suggestions')
    .select('id, suggested_name, category_ids, status')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .single();

  if (fetchErr || !suggestion) return jsonError(404, 'Suggestion not found');
  if (suggestion.status !== 'pending') return jsonError(409, 'Suggestion already reviewed');

  // Mark suggestion reviewed
  const { error: updateErr } = await db
    .schema('app')
    .from('reco_bundle_suggestions')
    .update({ status: body.status, reviewed_at: new Date().toISOString() })
    .eq('id', id);

  if (updateErr) {
    console.error('[PATCH /api/tenant/reco/bundle-suggestions/[id]] update', updateErr);
    return jsonError(500, updateErr.message);
  }

  if (body.status === 'accepted') {
    // Create the bundle
    const bundleName = body.name ?? suggestion.suggested_name ?? 'Suggested Bundle';
    const { data: bundle, error: bundleErr } = await db
      .schema('app')
      .from('reco_bundles')
      .insert({
        tenant_id: claims.tenant_id,
        name: bundleName,
        source: 'auto_suggested',
        is_active: true,
        created_by: claims.sub,
      })
      .select('id')
      .single();

    if (bundleErr) {
      console.error('[PATCH /api/tenant/reco/bundle-suggestions/[id]] bundle insert', bundleErr);
      return jsonError(500, bundleErr.message);
    }

    // Create slots for each category in the suggestion
    const slots = (suggestion.category_ids ?? []).map((catId: string, idx: number) => ({
      bundle_id: bundle.id,
      tenant_category_id: catId,
      is_required: true,
      display_order: idx,
    }));

    if (slots.length > 0) {
      const { error: slotsErr } = await db
        .schema('app')
        .from('reco_bundle_slots')
        .insert(slots);

      if (slotsErr) {
        console.error('[PATCH /api/tenant/reco/bundle-suggestions/[id]] slots insert', slotsErr);
        return jsonError(500, slotsErr.message);
      }
    }

    return NextResponse.json({ ok: true, bundle_id: bundle.id });
  }

  return NextResponse.json({ ok: true });
}
