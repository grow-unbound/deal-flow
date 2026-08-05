import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/constants';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { GET as getInvoicesMetrics } from '../metrics/route';

export const dynamic = 'force-dynamic';

/**
 * O(1) KPI snapshot adapter for legacy summary consumers.
 */
export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, invoicesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.INVOICES, claims.tenant_id),
    ]);
    if (!orderMgmt || !invoicesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const metricsRes = await getInvoicesMetrics(request);
    if (!metricsRes.ok) {
      const body = await metricsRes.json().catch(() => ({ error: 'Failed to fetch summary' }));
      return NextResponse.json(body, { status: metricsRes.status });
    }

    const metrics = await metricsRes.json();
    const cards = Array.isArray(metrics.cards) ? metrics.cards : [];
    const invoicedCard = cards.find((card: { id?: string; label?: string }) => card.id === 'invoiced_sales' || card.label?.toLowerCase().includes('invoiced'));
    const outstandingCard = cards.find((card: { id?: string; label?: string }) => card.id === 'outstanding_dues' || card.label?.toLowerCase().includes('outstanding'));
    const overdueCard = cards.find((card: { id?: string; label?: string }) => card.id === 'overdue_receivables' || card.label?.toLowerCase().includes('overdue'));

    return NextResponse.json(
      {
        total: invoicedCard?.document_count ?? invoicedCard?.entity_count ?? 0,
        total_count: invoicedCard?.document_count ?? invoicedCard?.entity_count ?? 0,
        outstanding_amt: outstandingCard?.value ?? 0,
        overdue_count: overdueCard?.document_count ?? overdueCard?.entity_count ?? 0,
        overdue_amt: overdueCard?.value ?? 0,
        paid_count: null,
        refreshed_at: metrics.computed_at ?? null,
        as_of: metrics.computed_at ?? null,
        commercial_horizon_days: null,
        table_period: metrics.period?.period_key ?? null,
      },
      { headers: SELLER_CACHE_PERSONAL },
    );
  } catch (e) {
    console.error('[GET /api/tenant/invoices/summary]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
