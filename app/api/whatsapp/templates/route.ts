import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';

/**
 * WhatsApp Broadcast Phase E — platform-managed template list.
 *
 * Spec §4.1: sellers pick from a fixed menu of templates the platform has
 * already registered/approved with Meta — tenant_id IS NULL for every MVP
 * row. No tenant-authoring UI, so this is a plain read-only listing.
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
  const { data: rows, error } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id, meta_template_name, meta_category, use_case, body, variables, approval_status')
    .is('tenant_id', null)
    .is('deleted_at', null)
    .order('use_case', { ascending: true });

  if (error) {
    console.error('[GET /api/whatsapp/templates] DB error:', error.code, error.message);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }

  return NextResponse.json({ templates: rows ?? [] }, { headers: SELLER_CACHE_REFERENCE });
}
