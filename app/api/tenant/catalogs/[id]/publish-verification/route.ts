import { NextRequest, NextResponse } from 'next/server';
import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { buildCampaignPublishVerification } from '@/lib/server/campaign-publish-preview';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: campaign, error } = await db
    .schema('app')
    .from('campaigns')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Failed to load campaign' }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  const verification = await buildCampaignPublishVerification(db, {
    tenantId: claims.tenant_id,
    whatsappFeatureEnabled: flagEnabled,
  });

  return NextResponse.json(verification, { headers: SELLER_CACHE_PERSONAL });
}
