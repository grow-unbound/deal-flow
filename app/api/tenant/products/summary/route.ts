import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

    const [setupRes, lowStockRes] = await Promise.all([
      supabaseAdmin
        .schema('app')
        .from('metrics_tenant_setup_snapshot')
        .select('active_product_count, computed_at, updated_at')
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null)
        .maybeSingle(),
      supabaseAdmin
        .schema('app')
        .from('metrics_product_snapshot')
        .select('tenant_product_id', { count: 'exact', head: true })
        .eq('tenant_id', claims.tenant_id)
        .eq('low_stock', true)
        .is('deleted_at', null),
    ]);

    if (setupRes.error || lowStockRes.error) {
      console.error('[GET /api/tenant/products/summary]', setupRes.error ?? lowStockRes.error);
      return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
    }

    if (!setupRes.data) {
      return NextResponse.json({ total: null }, { status: 404 });
    }

    const activeCount = Number(setupRes.data.active_product_count ?? 0);
    return NextResponse.json(
      {
        total_count: activeCount,
        active_count: activeCount,
        low_stock_count: lowStockRes.count ?? 0,
        refreshed_at: setupRes.data.computed_at ?? setupRes.data.updated_at ?? null,
      },
      { headers: SELLER_CACHE_PERSONAL },
    );
  } catch (e) {
    console.error('[GET /api/tenant/products/summary]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
