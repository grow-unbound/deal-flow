import { NextRequest, NextResponse } from 'next/server';
import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .schema('app')
    .from('campaigns')
    .select('id, name, share_token')
    .eq('tenant_id', claims.tenant_id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[GET /api/whatsapp/broadcasts/campaign-options] DB error:', error.code, error.message);
    return NextResponse.json({ error: 'Failed to fetch campaign options' }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data ?? [] }, { headers: SELLER_CACHE_REFERENCE });
}
