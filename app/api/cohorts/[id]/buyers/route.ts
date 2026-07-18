import { NextRequest, NextResponse } from 'next/server';

import { detailSearchResponse, getDetailSearchContext } from '@/lib/server/detail-tab-search-route';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getDetailSearchContext(request);
  if (context instanceof NextResponse) return context;

  const { id } = await params;
  const activity = request.nextUrl.searchParams.get('activity') || null;
  const sort = request.nextUrl.searchParams.get('sort') || 'spend_desc';
  const q = context.query?.toLowerCase() ?? '';

  const membersRes = await context.db
    .schema('app')
    .from('cohort_members')
    .select('buyer_id, buyers!inner(id, business_name, contact_name, external_ref, geography, tier)')
    .eq('cohort_id', id);
  if (membersRes.error) {
    return NextResponse.json({ error: 'Failed to search cohort buyers' }, { status: 500 });
  }

  const members = (membersRes.data ?? []) as Array<{
    buyer_id: string;
    buyers: {
      id: string;
      business_name: string | null;
      contact_name: string | null;
      external_ref: string | null;
      geography: Record<string, unknown> | null;
      tier: string | null;
    };
  }>;
  const buyerIds = members.map((row) => row.buyer_id);

  const metricsRes = buyerIds.length > 0
    ? await context.db
        .schema('app')
        .from('metrics_buyer_snapshot')
        .select('buyer_id, order_count_90d, order_value_90d, last_order_at, receivable_amount')
        .eq('tenant_id', context.tenantId)
        .in('buyer_id', buyerIds)
        .is('deleted_at', null)
    : { data: [], error: null };
  if (metricsRes.error) {
    return NextResponse.json({ error: 'Failed to search cohort buyers' }, { status: 500 });
  }

  const metricsByBuyer = new Map(
    ((metricsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.buyer_id), row]),
  );

  const rows = members
    .map((member) => {
      const buyer = member.buyers;
      const metric = metricsByBuyer.get(member.buyer_id);
      const spend = Number(metric?.order_value_90d ?? 0);
      const orders = Number(metric?.order_count_90d ?? 0);
      const lastOrderAt = (metric?.last_order_at as string | null) ?? null;
      return {
        buyer_id: buyer.id,
        business_name: buyer.business_name ?? 'Unknown buyer',
        contact_name: buyer.contact_name,
        external_ref: buyer.external_ref,
        geography_label: String(
          (buyer.geography as Record<string, unknown> | null)?.city
          ?? (buyer.geography as Record<string, unknown> | null)?.state
          ?? '—',
        ),
        tier: buyer.tier,
        mtd_spend: spend,
        orders_mtd: orders,
        aov: orders > 0 ? Number((spend / orders).toFixed(2)) : 0,
        credit_used: Number(metric?.receivable_amount ?? 0),
        last_order_at: lastOrderAt,
      };
    })
    .filter((row) => {
      if (q) {
        const haystack = [row.business_name, row.contact_name, row.external_ref, row.geography_label].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (activity === 'ordered_mtd' && row.orders_mtd <= 0) return false;
      if (activity === 'dormant') {
        if (row.last_order_at && new Date(row.last_order_at).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });

  rows.sort((a, b) => {
    if (sort === 'orders_desc') return b.orders_mtd - a.orders_mtd || a.business_name.localeCompare(b.business_name);
    if (sort === 'aov_desc') return b.aov - a.aov || a.business_name.localeCompare(b.business_name);
    if (sort === 'name_asc') return a.business_name.localeCompare(b.business_name);
    if (sort === 'last_order_desc') {
      return (new Date(b.last_order_at ?? 0).getTime() - new Date(a.last_order_at ?? 0).getTime())
        || a.business_name.localeCompare(b.business_name);
    }
    return b.mtd_spend - a.mtd_spend || a.business_name.localeCompare(b.business_name);
  });

  const total = rows.length;
  const pagedRows = rows.slice(context.offset, context.offset + context.limit).map((row) => ({
    ...row,
    total_count: total,
  }));

  return detailSearchResponse(pagedRows, context.limit, context.offset);
}
