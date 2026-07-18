import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';

export async function GET(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const q = req.nextUrl.searchParams.get('q') ?? '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data, error } = await db.schema('catalog').rpc('search_available_brands_for_tenant', {
      p_tenant_id: claims.tenant_id,
      p_query: q.trim() || null,
      p_limit: 20,
    });

    if (error) {
      return NextResponse.json({ error: 'Failed to search brands' }, { status: 500 });
    }

    return NextResponse.json({ brands: data ?? [] }, { headers: SELLER_CACHE_REFERENCE });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
