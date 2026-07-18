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

    const isAssistant = claims.role === 'seller_assistant';
    const assistantLocationIds = isAssistant ? (claims.location_ids ?? []).filter(Boolean) : [];
    if (isAssistant && assistantLocationIds.length === 0) {
      return NextResponse.json({ total: null }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .schema('app')
      .rpc('get_metrics_v2_customer_summary', {
        p_tenant_id: claims.tenant_id,
        p_location_ids: isAssistant ? assistantLocationIds : null,
      });

    if (error) {
      console.error('[GET /api/tenant/customers/summary]', error);
      return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
    }

    const payload = data as Record<string, unknown> | null;
    if (!payload || Number(payload.total_count ?? 0) === 0) {
      return NextResponse.json({ total: null }, { status: 404 });
    }

    return NextResponse.json(payload, { headers: SELLER_CACHE_PERSONAL });
  } catch (e) {
    console.error('[GET /api/tenant/customers/summary]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
