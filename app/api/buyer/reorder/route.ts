import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { assembleBuyerCatalogItemsForProductIds } from '@/lib/server/buyer-assemble-catalog-items';
import type { BuyerCatalogItem } from '@/types/buyer';

export interface BuyerReorderOrderSummary {
  id: string;
  order_number: string;
  placed_at: string;
  items: BuyerCatalogItem[];
}

export interface BuyerReorderCategoryGroup {
  category_id: string;
  category_name: string;
  items: BuyerCatalogItem[];
}

export interface BuyerReorderResponse {
  has_history: boolean;
  recent_orders: BuyerReorderOrderSummary[];
  by_category: BuyerReorderCategoryGroup[];
}

export async function GET(request: NextRequest): Promise<NextResponse<BuyerReorderResponse | { error: string }>> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const context = profile.context;
    const empty: BuyerReorderResponse = {
      has_history: false,
      recent_orders: [],
      by_category: [],
    };

    if (context.mode === 'preview' || !profile.buyer?.id) {
      return NextResponse.json(empty);
    }

    const tenantId = context.tenant_id;
    const buyerId = profile.buyer.id;
    const db = supabaseAdmin;

    const ordersRes = await db
      .schema('app')
      .from('orders')
      .select('id, order_number, placed_at')
      .eq('tenant_id', tenantId)
      .eq('buyer_id', buyerId)
      .is('deleted_at', null)
      .order('placed_at', { ascending: false })
      .limit(20);

    if (ordersRes.error) {
      console.error('[GET /api/buyer/reorder] orders:', ordersRes.error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const orders = (ordersRes.data ?? []) as Array<{ id: string; order_number: string; placed_at: string | null }>;
    if (orders.length === 0) {
      return NextResponse.json(empty);
    }

    const orderIds = orders.map((o) => o.id);
    const itemsRes = await db
      .schema('app')
      .from('order_items')
      .select('order_id, tenant_product_id')
      .in('order_id', orderIds)
      .is('deleted_at', null);

    if (itemsRes.error) {
      console.error('[GET /api/buyer/reorder] order_items:', itemsRes.error);
      return NextResponse.json({ error: 'Failed to fetch order items' }, { status: 500 });
    }

    const itemRows = (itemsRes.data ?? []) as Array<{ order_id: string; tenant_product_id: string }>;
    if (itemRows.length === 0) {
      return NextResponse.json(empty);
    }

    const productIdSet = new Set(itemRows.map((r) => r.tenant_product_id));
    const productIds = Array.from(productIdSet);

    const itemMap = await assembleBuyerCatalogItemsForProductIds(db, {
      buyerId,
      productIds,
      catalogId: null,
      catalogName: null,
      catalogValidUntil: null,
      priceOverrides: new Map(),
    });

    const orderItemsByOrder = new Map<string, string[]>();
    for (const row of itemRows) {
      const list = orderItemsByOrder.get(row.order_id) ?? [];
      if (!list.includes(row.tenant_product_id)) {
        list.push(row.tenant_product_id);
      }
      orderItemsByOrder.set(row.order_id, list);
    }

    const recentOrders: BuyerReorderOrderSummary[] = [];
    for (const ord of orders.slice(0, 5)) {
      const pids = orderItemsByOrder.get(ord.id) ?? [];
      const items: BuyerCatalogItem[] = [];
      for (const pid of pids) {
        const item = itemMap.get(pid);
        if (item) items.push(item);
      }
      if (items.length === 0) continue;
      recentOrders.push({
        id: ord.id,
        order_number: ord.order_number,
        placed_at: ord.placed_at ?? new Date().toISOString(),
        items,
      });
    }

    const byCategoryMap = new Map<string, { name: string; items: Map<string, BuyerCatalogItem> }>();
    for (const item of itemMap.values()) {
      const cid = item.category_id ?? '';
      const cname = item.category_name ?? 'Other';
      let bucket = byCategoryMap.get(cid);
      if (!bucket) {
        bucket = { name: cname, items: new Map() };
        byCategoryMap.set(cid, bucket);
      }
      bucket.items.set(item.tenant_product_id, item);
    }

    const by_category: BuyerReorderCategoryGroup[] = Array.from(byCategoryMap.entries())
      .map(([, v]) => ({
        category_id: [...v.items.values()][0]?.category_id ?? '',
        category_name: v.name,
        items: [...v.items.values()],
      }))
      .sort((a, b) => a.category_name.localeCompare(b.category_name));

    return NextResponse.json({
      has_history: true,
      recent_orders: recentOrders,
      by_category,
    });
  } catch (err) {
    console.error('[GET /api/buyer/reorder]', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
