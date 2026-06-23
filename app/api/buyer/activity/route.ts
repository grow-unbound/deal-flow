import { NextRequest, NextResponse } from 'next/server';

import { loadBuyerActivityFeed } from '@/lib/server/buyer-activity';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ items: [], next_cursor: null }, { status: 401 });
    }

    if (profile.context.mode === 'preview' || !profile.buyer?.id) {
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

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[GET /api/buyer/activity]', error);
    return NextResponse.json({ items: [], next_cursor: null }, { status: 500 });
  }
}
