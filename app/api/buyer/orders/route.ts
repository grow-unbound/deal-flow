import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  placed_at: string;
}

interface OrderItemCountRow {
  order_id: string;
}

export async function GET(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id || !claims.buyer_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin;
    const buyerId = claims.buyer_id;
    const tenantId = claims.tenant_id;

    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200);

    const [ordersRes] = await Promise.all([
      db
        .schema('app')
        .from('orders')
        .select('id, order_number, status, total_amount, placed_at')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null)
        .order('placed_at', { ascending: false })
        .limit(limit),
    ]);

    if (ordersRes.error) {
      console.error('[GET /api/buyer/orders] query error:', ordersRes.error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const orders = (ordersRes.data ?? []) as OrderRow[];
    const orderIds = orders.map((o) => o.id);

    let itemCounts: OrderItemCountRow[] = [];
    if (orderIds.length > 0) {
      const itemsRes = await db
        .schema('app')
        .from('order_items')
        .select('order_id')
        .in('order_id', orderIds)
        .is('deleted_at', null);

      if (!itemsRes.error) {
        itemCounts = (itemsRes.data ?? []) as OrderItemCountRow[];
      }
    }

    const countByOrder = new Map<string, number>();
    for (const row of itemCounts) {
      countByOrder.set(row.order_id, (countByOrder.get(row.order_id) ?? 0) + 1);
    }

    const result = orders.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      total_amount: Number(o.total_amount ?? 0),
      placed_at: o.placed_at,
      item_count: countByOrder.get(o.id) ?? 0,
    }));

    return NextResponse.json({ orders: result });
  } catch (err) {
    console.error('[GET /api/buyer/orders] unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
