import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { getPostHogClient } from '@/lib/posthog-server';
import type { BuyerAppMode } from '@/types/buyer';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { getInAppCreateFlags } from '@/lib/server/seller-features';
import { fetchWhatsappNotificationContext } from '@/lib/server/notification-context';
import { sendOrderReceivedBuyer, sendOrderReceivedSeller } from '@/lib/server/whatsapp';
import { BUYER_CACHE_PERSONAL } from '@/lib/server/buyer-cache-headers';
import { PAGE_SIZE, encodeCursor, decodeCursor } from '@/lib/pagination';

export interface BuyerOrderPlaceRequest {
  items: Array<{
    tenant_product_id: string;
    qty: number;
    unit_price: number;
    product_name?: string;
  }>;
  notes?: string;
  campaign_id?: string | null;
  location_id?: string | null;
  place_of_supply?: string | null;
}

export interface BuyerOrderPlaceResponse {
  success: boolean;
  order_id?: string;
  order_number?: string | null;
  whatsapp_sent?: boolean;
  error?: string;
}

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
  campaign_id: string | null;
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
  nextCursor: string | null;
  total: number | null;
  seller_preview?: boolean;
  preview_message?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<BuyerOrderPlaceResponse>> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = profile.context;

    let body: BuyerOrderPlaceRequest;
    try {
      body = (await request.json()) as BuyerOrderPlaceRequest;
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { items, notes, campaign_id, location_id } = body;

    const createFlags = await getInAppCreateFlags(context.tenant_id!);
    if (!createFlags.create_sales_orders) {
      return NextResponse.json({ success: false, error: 'Order placement is not available' }, { status: 403 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'Cart must have at least one item' }, { status: 400 });
    }
    for (const item of items) {
      if (!item.tenant_product_id) {
        return NextResponse.json({ success: false, error: 'Each item must have a valid tenant_product_id' }, { status: 400 });
      }
      if (typeof item.qty !== 'number' || item.qty <= 0) {
        return NextResponse.json({ success: false, error: 'Each item must have qty > 0' }, { status: 400 });
      }
      if (typeof item.unit_price !== 'number' || item.unit_price <= 0) {
        return NextResponse.json({ success: false, error: 'Each item must have unit_price > 0' }, { status: 400 });
      }
    }

    const subtotal = items.reduce((sum, item) => sum + item.qty * item.unit_price, 0);
    const tax_amount = Math.round(subtotal * 0.18);
    const total_amount = subtotal + tax_amount;

    if (context.mode === 'preview' && !context.buyer_id) {
      return NextResponse.json({
        success: true,
        order_id: `preview-order-${Date.now()}`,
        order_number: 'PREVIEW-ORDER',
      });
    }

    if (!profile.buyer?.id || !context.sub) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!location_id) {
      return NextResponse.json(
        { success: false, error: 'Select a delivery location before placing an order' },
        { status: 400 },
      );
    }

    const tenant_id = context.tenant_id;
    const buyer_id = profile.buyer.id;
    const placed_by = context.sub;
    const db = supabaseAdmin ?? supabase;

    const placeOfSupply = (typeof body.place_of_supply === 'string' && body.place_of_supply.trim())
      || 'Unknown';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: orderCount } = await (db as any)
      .schema('app')
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id);

    const year = new Date().getFullYear();
    const paddedCount = String((orderCount ?? 0) + 1).padStart(4, '0');
    const order_number = `ORD-${year}-${paddedCount}`;
    const placed_at = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newOrder, error: insertError } = await (db as any)
      .schema('app')
      .from('orders')
      .insert({
        tenant_id,
        buyer_id,
        placed_by,
        order_number,
        status: 'received',
        source: 'buyer_app',
        campaign_id: campaign_id ?? null,
        location_id,
        place_of_supply: placeOfSupply,
        subtotal,
        tax_amount,
        total_amount,
        notes: notes ?? null,
        placed_at,
        created_by: placed_by,
      })
      .select('id, order_number')
      .single();

    if (insertError || !newOrder) {
      console.error('[POST /api/buyer/orders] Insert error:', insertError);
      return NextResponse.json({ success: false, error: 'Failed to create order' }, { status: 500 });
    }

    const typed = newOrder as { id: string; order_number: string };

    const orderItemRows = items.map((item) => ({
      order_id: typed.id,
      tenant_product_id: item.tenant_product_id,
      qty: item.qty,
      unit_price: item.unit_price,
      tax_rate: 18,
      line_total: item.qty * item.unit_price,
      created_by: placed_by,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: itemsError } = await (db as any).schema('app').from('order_items').insert(orderItemRows);
    if (itemsError) {
      console.error('[POST /api/buyer/orders] Items insert error:', itemsError);
      return NextResponse.json({ success: false, error: 'Failed to create order items' }, { status: 500 });
    }

    try {
      const ph = getPostHogClient();
      ph.capture({
        distinctId: buyer_id,
        event: 'order_placed',
        properties: {
          tenant_id,
          buyer_id,
          order_id: typed.id,
          order_number: typed.order_number,
          item_count: items.length,
          total_amount,
          source: 'buyer_app',
        },
      });
      await ph.flush();
    } catch {
      // non-blocking
    }

    let whatsappSent = false;
    try {
      const ctx = await fetchWhatsappNotificationContext(
        tenant_id!,
        buyer_id,
        location_id,
        'order_placed',
      );
      if (ctx) {
        const notificationResults = await Promise.allSettled([
          sendOrderReceivedBuyer(ctx, typed.id, typed.order_number, total_amount, items.length),
          sendOrderReceivedSeller(ctx, typed.id, typed.order_number, total_amount, items.length),
        ]);
        whatsappSent = notificationResults.some((result) => result.status === 'fulfilled');
        if (whatsappSent) {
          await (db as any)
            .schema('app')
            .from('orders')
            .update({
              sent_at: new Date().toISOString(),
              sent_channel: 'whatsapp',
            })
            .eq('id', typed.id);
        }
      }
    } catch {
      // non-blocking — order creation already succeeded
    }

    return NextResponse.json({
      success: true,
      order_id: typed.id,
      order_number: typed.order_number,
      whatsapp_sent: whatsappSent,
    });
  } catch (error) {
    console.error('[POST /api/buyer/orders] unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
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

    // Pure seller preview — no linked buyer account
    if (context.mode === 'preview' && !context.buyer_id) {
      const payload: BuyerOrdersResponse = {
        mode: 'preview',
        orders: [],
        nextCursor: null,
        total: null,
        seller_preview: true,
      };
      return NextResponse.json(payload, { headers: BUYER_CACHE_PERSONAL });
    }

    // Real buyer or seller with linked buyer account — fetch real orders
    const buyerId = profile.buyer?.id ?? context.buyer_id;
    if (!buyerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabaseAdmin;
    const tenantId = context.tenant_id;
    const { searchParams } = request.nextUrl;
    const reqLimit = Math.min(Number(searchParams.get('limit') ?? PAGE_SIZE.BUYER), PAGE_SIZE.MAX);
    const cursorParam = searchParams.get('cursor');

    let query = db
      .schema('app')
      .from('orders')
      .select('id, order_number, status, total_amount, placed_at, campaign_id')
      .eq('tenant_id', tenantId)
      .eq('buyer_id', buyerId)
      .is('deleted_at', null)
      .order('placed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(reqLimit + 1);

    if (cursorParam) {
      const { created_at, id } = decodeCursor(cursorParam);
      query = query.or(`placed_at.lt.${created_at},and(placed_at.eq.${created_at},id.lt.${id})`);
    }

    const [ordersRes, countRes] = await Promise.all([
      query,
      db
        .schema('app')
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null),
    ]);

    if (ordersRes.error) {
      console.error('[GET /api/buyer/orders] orders query error:', ordersRes.error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const rawOrders = (ordersRes.data ?? []) as OrderRow[];
    const hasNextPage = rawOrders.length > reqLimit;
    const orders = hasNextPage ? rawOrders.slice(0, reqLimit) : rawOrders;
    const lastOrder = orders.at(-1);
    const nextCursor = hasNextPage && lastOrder
      ? encodeCursor({ created_at: lastOrder.placed_at, id: lastOrder.id })
      : null;

    const orderIds = orders.map((o) => o.id);
    const catalogIds = Array.from(
      new Set(orders.map((o) => o.campaign_id).filter((id): id is string => id !== null))
    );

    const [itemsRes, catalogsRes] = await Promise.all([
      orderIds.length > 0
        ? db.schema('app').from('order_items').select('order_id').in('order_id', orderIds).is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      catalogIds.length > 0
        ? db.schema('app').from('campaigns').select('id, name').in('id', catalogIds).is('deleted_at', null)
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
      mode: context.mode,
      seller_preview: false,
      orders: orders.map((order) => ({
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        total_amount: Number(order.total_amount ?? 0),
        placed_at: order.placed_at,
        catalog_name: order.campaign_id ? (catalogNameById.get(order.campaign_id) ?? null) : null,
        items_count: countByOrder.get(order.id) ?? 0,
      })),
      nextCursor,
      total: countRes.count ?? null,
    };

    return NextResponse.json(payload, { headers: BUYER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/buyer/orders] unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
