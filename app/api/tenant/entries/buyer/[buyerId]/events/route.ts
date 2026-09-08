import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buyerId: string }> },
) {
  const { buyerId } = await params;
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const parsed = QuerySchema.safeParse({
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    }

    const { data, error } = await (supabaseAdmin as any)
      .schema('app')
      .rpc('list_entry_events_for_buyer', {
        p_tenant_id: claims.tenant_id,
        p_buyer_id: buyerId,
        p_limit: parsed.data.limit,
      });

    if (error) {
      console.error('[GET /api/tenant/entries/buyer/[buyerId]/events]', error);
      return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
    }

    return NextResponse.json({ events: data ?? [] }, { headers: SELLER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/tenant/entries/buyer/[buyerId]/events]', error);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }
}
