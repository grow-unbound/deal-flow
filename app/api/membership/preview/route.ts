import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { MembershipPreviewRequestSchema, type MembershipEntityType } from '@/lib/zod';

const FLAG_BY_ENTITY: Record<MembershipEntityType, string> = {
  cohort: FEATURE_FLAGS.COHORTS,
  price_list: FEATURE_FLAGS.PRICING_ENGINE,
  campaign_buyers: FEATURE_FLAGS.CATALOG_PUBLISHING,
  campaign_products: FEATURE_FLAGS.CATALOG_PUBLISHING,
};

// Shared live-count preview for the Automatic membership filter panel -- one endpoint for all
// four surfaces (Customer Groups, Pricelists, Campaign buyers, Campaign products), used both
// inline in the Create/Edit overlay (before save) and in the Details tab (after save).
export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = MembershipPreviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 422 });
  }

  const flagEnabled = await getFlag(FLAG_BY_ENTITY[parsed.data.entity_type], claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data, error } = await db.schema('app').rpc('preview_membership_count', {
    p_tenant_id: claims.tenant_id,
    p_entity_type: parsed.data.entity_type,
    p_rules: parsed.data.rules,
  });

  if (error) {
    console.error('[POST /api/membership/preview]', error.message);
    return NextResponse.json({ error: 'Preview failed' }, { status: 500 });
  }

  const result = data as { count: number; sample_names: string[] } | null;
  return NextResponse.json({
    count: result?.count ?? 0,
    sample_names: result?.sample_names ?? [],
  });
}
