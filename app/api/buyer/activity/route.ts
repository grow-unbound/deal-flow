import { NextRequest, NextResponse } from 'next/server';

import { loadBuyerActivityFeed } from '@/lib/server/buyer-activity';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { BUYER_CACHE_PERSONAL } from '@/lib/server/buyer-cache-headers';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ items: [], next_cursor: null }, { status: 401 });
    }

    if (!profile.buyer?.id) {
      return NextResponse.json({ items: [], next_cursor: null });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '10'), 50);
    const cursor = request.nextUrl.searchParams.get('cursor');
    const payload = await loadBuyerActivityFeed(supabaseAdmin as any, {
      tenantId: profile.context.tenant_id,
      buyerId: profile.buyer.id,
      limit,
      cursor,
    });

    return NextResponse.json(payload, { headers: BUYER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/buyer/activity]', error);
    return NextResponse.json({ items: [], next_cursor: null }, { status: 500 });
  }
}
