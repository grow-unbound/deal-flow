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

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';

  const { data, error } = await (supabaseAdmin as any)
    .schema('app')
    .from('reco_bundle_suggestions')
    .select('id, suggested_name, category_ids, avg_co_occurrence, confidence_score, status, computed_at, reviewed_at')
    .eq('tenant_id', claims.tenant_id)
    .eq('status', status)
    .order('confidence_score', { ascending: false });

  if (error) {
    console.error('[GET /api/tenant/reco/bundle-suggestions]', error);
    return jsonError(500, error.message);
  }

  // Hydrate category names for display
  const allCategoryIds = Array.from(new Set((data ?? []).flatMap((s: any) => s.category_ids ?? [])));
  let categoryNames: Record<string, string> = {};
  if (allCategoryIds.length > 0) {
    const { data: cats } = await (supabaseAdmin as any)
      .schema('app')
      .from('tenant_categories')
      .select('id, name')
      .in('id', allCategoryIds)
      .eq('tenant_id', claims.tenant_id);
    categoryNames = Object.fromEntries((cats ?? []).map((c: any) => [c.id, c.name]));
  }

  const suggestions = (data ?? []).map((s: any) => ({
    ...s,
    category_names: (s.category_ids ?? []).map((id: string) => categoryNames[id] ?? id),
  }));

  return NextResponse.json({ suggestions });
}
