import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/constants';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { GET as getEstimatesMetrics } from '../metrics/route';

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

    const estimatesEnabled = await getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id);
    if (!estimatesEnabled) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const metricsRes = await getEstimatesMetrics(request);
    if (!metricsRes.ok) {
      const body = await metricsRes.json().catch(() => ({ error: 'Failed to fetch summary' }));
      return NextResponse.json(body, { status: metricsRes.status });
    }

    const metrics = await metricsRes.json();
    const cards = Array.isArray(metrics.cards) ? metrics.cards : [];
    const valueCard = cards.find((card: { id?: string; label?: string }) => card.id === 'estimate_value_created' || card.label?.toLowerCase().includes('estimate value'));
    const expiringCard = cards.find((card: { id?: string; label?: string }) => card.id === 'expiring_7d' || card.label?.toLowerCase().includes('expiring'));

    return NextResponse.json(
      {
        total_count: valueCard?.document_count ?? valueCard?.entity_count ?? 0,
        draft_count: null,
        sent_count: null,
        accepted_count: null,
        total_value: valueCard?.value ?? 0,
        accepted_value: null,
        expiring_soon: expiringCard?.document_count ?? expiringCard?.entity_count ?? 0,
        refreshed_at: metrics.computed_at ?? null,
      },
      { headers: SELLER_CACHE_PERSONAL },
    );
  } catch (e) {
    console.error('[GET /api/tenant/estimates/summary]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
