import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  cohort_id: z.string().uuid().nullable(),
  price_list_id: z.string().uuid().nullable(),
});

/**
 * GET /api/tenant/entries/approval-price-preview?cohort_id=&price_list_id=
 *
 * "This buyer will see prices from: <list>" for the approval dialog. Uses the same tier order as
 * app.resolve_price (buyer-level list > group lists > all-buyers list, then priority). Only lists
 * belonging to the caller's tenant are ever considered. seller_admin only.
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

    const parsed = QuerySchema.safeParse({
      cohort_id: request.nextUrl.searchParams.get('cohort_id') || null,
      price_list_id: request.nextUrl.searchParams.get('price_list_id') || null,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    }

    const { data, error } = await (supabaseAdmin as any)
      .schema('app')
      .rpc('preview_approval_price_source', {
        p_tenant_id: claims.tenant_id,
        p_actor_user_id: claims.sub,
        p_cohort_id: parsed.data.cohort_id,
        p_price_list_id: parsed.data.price_list_id,
      });

    if (error) {
      if (String(error.message ?? '').includes('admin_only_entry_action')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      console.error('[GET /api/tenant/entries/approval-price-preview]', error);
      return NextResponse.json({ error: 'Failed to load preview' }, { status: 500 });
    }

    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[GET /api/tenant/entries/approval-price-preview]', error);
    return NextResponse.json({ error: 'Failed to load preview' }, { status: 500 });
  }
}
