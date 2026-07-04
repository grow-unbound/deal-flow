import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';

/**
 * WhatsApp Broadcast Phase F — read-only platform kill-switch / quality
 * rating status, for the composer banner (§7.3).
 *
 * Spec §7.3: sellers should be able to SELECT quality_rating_state /
 * broadcast_sending_paused so the composer can render the right tenant-facing
 * copy (see src/constants/whatsapp-quality-banner.ts for the verbatim text).
 * This route is read-only — INSERT/UPDATE on app.whatsapp_platform_config
 * is service-role only, no route here exposes writes.
 */
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: row, error } = await db
    .schema('app')
    .from('whatsapp_platform_config')
    .select('broadcast_sending_paused, quality_rating_state')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('[GET /api/whatsapp/platform-status] DB error:', error.code, error.message);
    return NextResponse.json({ error: 'Failed to fetch platform status' }, { status: 500 });
  }

  return NextResponse.json({
    broadcast_sending_paused: row?.broadcast_sending_paused ?? false,
    quality_rating_state: row?.quality_rating_state ?? 'green',
  });
}
