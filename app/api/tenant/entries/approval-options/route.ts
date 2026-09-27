import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tenant/entries/approval-options
 *
 * Customer groups (with an `eligible` flag: only manual-membership groups can take a hand-added
 * buyer) and active price lists for the buyer-approval dialog, plus the preselected default group.
 * seller_admin only; tenant comes from verified claims, never from the client.
 */
export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (claims.role !== 'seller_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { data, error } = await (supabaseAdmin as any)
      .schema('app')
      .rpc('get_approval_assignment_options', {
        p_tenant_id: claims.tenant_id,
        p_actor_user_id: claims.sub,
      });

    if (error) {
      if (String(error.message ?? '').includes('admin_only_entry_action')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      console.error('[GET /api/tenant/entries/approval-options]', error);
      return NextResponse.json({ error: 'Failed to load options' }, { status: 500 });
    }

    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[GET /api/tenant/entries/approval-options]', error);
    return NextResponse.json({ error: 'Failed to load options' }, { status: 500 });
  }
}
