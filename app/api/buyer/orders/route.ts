import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerAppMode } from '@/types/buyer';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';

type OrderStatus =
  | 'draft'
  | 'received'
  | 'confirmed'
  | 'partially_dispatched'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  placed_at: string;
  catalog_id: string | null;
}

interface OrderItemCountRow {
  order_id: string;
}

interface CatalogNameRow {
  id: string;
  name: string;
}

export interface BuyerOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  placed_at: string;
  catalog_name: string | null;
  items_count: number;
}

export interface BuyerOrdersResponse {
  mode: BuyerAppMode;
  orders: BuyerOrder[];
  preview_message?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const context = profile.context;
    if (context.mode === 'preview') {
      const payload: BuyerOrdersResponse = {
        mode: 'preview',
        orders: [],
        preview_message: 'Order history for a logged-in buyer will appear here.',
      };
      return NextResponse.json(payload);
    }

    if (!profile.buyer?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabaseAdmin;
    const buyerId = profile.buyer.id;
    const tenantId = context.tenant_id;
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '20'), 100);

    const ordersRes = await db
      .schema('app')
      .from('orders')
      .select('id, order_number, status, total_amount, placed_at, catalog_id')
      .eq('tenant_id', tenantId)
      .eq('buyer_id', buyerId)
      .is('deleted_at', null)
      .order('placed_at', { ascending: false })
      .limit(limit);

    if (ordersRes.error) {
      console.error('[GET /api/buyer/orders] orders query error:', ordersRes.error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const orders = (ordersRes.data ?? []) as OrderRow[];
    const orderIds = orders.map((o) => o.id);
    const catalogIds = Array.from(
      new Set(orders.map((o) => o.catalog_id).filter((id): id is string => id !== null))
    );

    const [itemsRes, catalogsRes] = await Promise.all([
      orderIds.length > 0
        ? db.schema('app').from('order_items').select('order_id').in('order_id', orderIds).is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      catalogIds.length > 0
        ? db.schema('app').from('published_catalogs').select('id, name').in('id', catalogIds).is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (itemsRes.error) {
      console.error('[GET /api/buyer/orders] items query error:', itemsRes.error);
      return NextResponse.json({ error: 'Failed to fetch order items' }, { status: 500 });
    }

    if (catalogsRes.error) {
      console.error('[GET /api/buyer/orders] catalogs query error:', catalogsRes.error);
      return NextResponse.json({ error: 'Failed to fetch catalog names' }, { status: 500 });
    }

    const itemCounts = (itemsRes.data ?? []) as OrderItemCountRow[];
    const catalogNames = (catalogsRes.data ?? []) as CatalogNameRow[];

    const countByOrder = new Map<string, number>();
    for (const item of itemCounts) {
      countByOrder.set(item.order_id, (countByOrder.get(item.order_id) ?? 0) + 1);
    }

    const catalogNameById = new Map(catalogNames.map((c) => [c.id, c.name]));

    const payload: BuyerOrdersResponse = {
      mode: 'buyer',
      orders: orders.map((order) => ({
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        total_amount: Number(order.total_amount ?? 0),
        placed_at: order.placed_at,
        catalog_name: order.catalog_id ? (catalogNameById.get(order.catalog_id) ?? null) : null,
        items_count: countByOrder.get(order.id) ?? 0,
      })),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[GET /api/buyer/orders] unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
