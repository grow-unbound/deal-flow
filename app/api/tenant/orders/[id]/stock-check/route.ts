import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, salesOrders] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.SALES_ORDERS, claims.tenant_id),
    ]);
    if (!orderMgmt || !salesOrders) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const { data: order, error: orderError } = await db
      .schema('app')
      .from('orders')
      .select('id, tenant_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const itemsRes = await db
      .schema('app')
      .from('order_items')
      .select('id, tenant_product_id, qty')
      .eq('order_id', id);

    if (itemsRes.error) {
      return NextResponse.json({ error: 'Failed to check stock' }, { status: 500 });
    }

    const items = (itemsRes.data ?? []) as Array<{ id: string; tenant_product_id: string; qty: number }>;
    const productIds = items.map((item) => item.tenant_product_id);
    const [inventoryRes, productsRes] = await Promise.all([
      productIds.length > 0
        ? db.schema('app').from('tenant_inventory').select('tenant_product_id, qty_available').in('tenant_product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length > 0
        ? db.schema('app').from('tenant_products').select('id, internal_sku, name_override').in('id', productIds).eq('tenant_id', claims.tenant_id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const onHandByProduct = new Map<string, number>();
    for (const row of (inventoryRes.data ?? []) as Array<{ tenant_product_id: string; qty_available: number | null }>) {
      onHandByProduct.set(
        row.tenant_product_id,
        (onHandByProduct.get(row.tenant_product_id) ?? 0) + Number(row.qty_available ?? 0),
      );
    }
    const productById = new Map(((productsRes.data ?? []) as Array<{ id: string; internal_sku: string; name_override: string | null }>).map((row) => [row.id, row]));

    return NextResponse.json({
      data: items.map((item) => {
        const onHand = onHandByProduct.get(item.tenant_product_id) ?? 0;
        const product = productById.get(item.tenant_product_id);
        const shortfall = Math.max(Number(item.qty) - onHand, 0);
        return {
          line_id: item.id,
          sku: product?.internal_sku ?? '—',
          product_name: product?.name_override ?? product?.internal_sku ?? 'Product',
          on_hand: onHand,
          qty: Number(item.qty),
          is_short: shortfall > 0,
          shortfall,
        };
      }),
    });
  } catch (error) {
    console.error('[GET /api/tenant/orders/[id]/stock-check]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
