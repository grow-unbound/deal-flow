import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { batchUpsertLineItems } from '@/lib/server/batch-upsert-line-items';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import {
  canAccessDocumentLocation,
  isSellerLocationSelectionAllowed,
  loadAccessibleSellerLocations,
  resolveDefaultSellerLocationId,
} from '@/lib/server/seller-location-access';
import { loadInventoryAvailabilityMap } from '@/lib/server/warehouse-inventory';
import { loadTenantSalesOrderComposer } from '@/lib/sales-orders/load-tenant-sales-order-composer';
import { loadTenantSalesOrderDetail } from '@/lib/sales-orders/load-tenant-sales-order-detail';
import { supabaseAdmin } from '@/lib/supabase';
import { getPostHogClient } from '@/lib/posthog-server';
import { withTenantSellerIds } from '@/lib/analytics-identity-server';
export const dynamic = 'force-dynamic';

const SalesOrderSaveSchema = z.object({
  order_number: z.string().min(1).optional(),
  buyer_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  order_date: z.string().optional(),
  expected_delivery: z.string().optional(),
  buyer_po_ref: z.string().max(255).optional(),
  place_of_supply: z.string().max(120).optional(),
  seller_note: z.string().max(8000).optional(),
  freight: z.number().min(0).optional(),
  discount_flat: z.number().min(0).optional(),
  round_off: z.number().optional(),
  has_backorder: z.boolean().optional(),
  estimate_id: z.string().uuid().nullable().optional(),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        tenant_product_id: z.string().uuid(),
        qty: z.number().positive(),
        unit_price: z.number().min(0),
        disc_pct: z.number().min(0).max(100),
        tax_pct: z.number().min(0).max(100),
        scheme_tag: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

const NON_SAVEABLE_STATUSES = new Set(['cancelled', 'delivered', 'invoiced']);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [orderMgmt, salesOrders] = await Promise.all([
    getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
    getFlag(FEATURE_FLAGS.SALES_ORDERS, claims.tenant_id),
  ]);
  if (!orderMgmt || !salesOrders) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const view = request.nextUrl.searchParams.get('view');
  if (view === 'composer') {
    const composer = await loadTenantSalesOrderComposer(supabaseAdmin as any, claims.tenant_id, id, claims);
    if (composer === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (composer === 'notfound') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(composer, { headers: SELLER_CACHE_PERSONAL });
  }

  const detail = await loadTenantSalesOrderDetail(supabaseAdmin as any, claims.tenant_id, id, claims.role ?? null, claims);
  if (detail === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (detail === 'notfound') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(detail, { headers: SELLER_CACHE_PERSONAL });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id || !claims.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [orderMgmt, salesOrders] = await Promise.all([
    getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
    getFlag(FEATURE_FLAGS.SALES_ORDERS, claims.tenant_id),
  ]);
  if (!orderMgmt || !salesOrders) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SalesOrderSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 });
  }

  const db = supabaseAdmin as any;

  const { data: orderRow, error: orderErr } = await db
    .schema('app')
    .from('orders')
    .select('id, tenant_id, location_id, status')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (orderErr || !orderRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (orderRow.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!canAccessDocumentLocation(claims, orderRow.location_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const dbStatus = String(orderRow.status ?? '');
  if (NON_SAVEABLE_STATUSES.has(dbStatus)) {
    return NextResponse.json({ error: 'Order cannot be edited in this status' }, { status: 409 });
  }

  const payload = parsed.data;
  const existing = await loadTenantSalesOrderComposer(db, claims.tenant_id, id, claims);
  if (existing === 'notfound' || existing === 'forbidden') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const allowedLocations = await loadAccessibleSellerLocations(db as any, claims.tenant_id, claims);
  const nextLocationId = payload.location_id ?? existing.location_id ?? resolveDefaultSellerLocationId(claims, allowedLocations);
  if (!nextLocationId || !isSellerLocationSelectionAllowed(claims, nextLocationId)) {
    return NextResponse.json({ error: 'Select a valid accessible location' }, { status: 400 });
  }

  const items = payload.items ?? existing.items;
  const subtotal = items.reduce((sum, row) => {
    const discounted = row.qty * row.unit_price * (1 - row.disc_pct / 100);
    return sum + discounted;
  }, 0);
  const taxAmount = items.reduce((sum, row) => {
    const taxable = row.qty * row.unit_price * (1 - row.disc_pct / 100);
    return sum + taxable * (row.tax_pct / 100);
  }, 0);
  const discountFlat = payload.discount_flat ?? existing.discount_flat;
  const freight = payload.freight ?? existing.freight;
  const roundOff = payload.round_off ?? existing.round_off;
  const grandTotal = Math.max(subtotal - discountFlat, 0) + taxAmount + freight + roundOff;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: claims.sub,
    location_id: nextLocationId,
    subtotal,
    tax_amount: taxAmount,
    total_amount: grandTotal,
  };

  if (payload.order_number !== undefined) updatePayload.order_number = payload.order_number;
  if (payload.buyer_id !== undefined) updatePayload.buyer_id = payload.buyer_id;
  if (payload.buyer_po_ref !== undefined) updatePayload.buyer_po_ref = payload.buyer_po_ref || null;
  if (payload.place_of_supply !== undefined) updatePayload.place_of_supply = payload.place_of_supply || null;
  if (payload.expected_delivery !== undefined) updatePayload.expected_delivery = payload.expected_delivery || null;
  if (payload.discount_flat !== undefined) updatePayload.discount_flat = payload.discount_flat;
  if (payload.freight !== undefined) updatePayload.freight = payload.freight;
  if (payload.round_off !== undefined) updatePayload.round_off = payload.round_off;
  if (payload.has_backorder !== undefined) updatePayload.has_backorder = payload.has_backorder;
  if (payload.estimate_id !== undefined) updatePayload.estimate_id = payload.estimate_id;
  if (payload.seller_note !== undefined) updatePayload.notes = payload.seller_note || null;

  if (payload.order_date !== undefined && payload.order_date.trim()) {
    const d = payload.order_date.slice(0, 10);
    updatePayload.order_date = d;
    updatePayload.placed_at = `${d}T12:00:00.000Z`;
  }

  const updateRes = await db.schema('app').from('orders').update(updatePayload).eq('id', id).eq('tenant_id', claims.tenant_id);

  if (updateRes.error) {
    console.error('[PATCH /api/tenant/orders/[id]]', updateRes.error);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }

  if (payload.items) {
    const existingItemIds = new Set(existing.items.map((row) => row.id));

    const onHandByProduct = await loadInventoryAvailabilityMap(
      db,
      payload.items.map((row) => row.tenant_product_id),
      nextLocationId,
    );

    const { error: itemsError } = await batchUpsertLineItems({
      db,
      table: 'order_items',
      parentColumn: 'order_id',
      parentId: id,
      existingItemIds,
      items: payload.items,
      actorId: claims.sub,
      buildPatch: (item) => {
        const discounted = item.qty * item.unit_price * (1 - item.disc_pct / 100);
        return {
          tenant_product_id: item.tenant_product_id,
          qty: item.qty,
          unit_price: item.unit_price,
          tax_rate: item.tax_pct,
          tax_pct: item.tax_pct,
          disc_pct: item.disc_pct,
          line_total: discounted + discounted * (item.tax_pct / 100),
          scheme_tag: item.scheme_tag ?? null,
          on_hand_at_confirm: onHandByProduct.get(item.tenant_product_id) ?? 0,
        };
      },
    });

    if (itemsError) {
      console.error('[PATCH /api/tenant/orders/[id]] items save error', itemsError);
      return NextResponse.json({ error: 'Failed to save order line items' }, { status: 500 });
    }
  }

  await db.schema('app').from('audit_log').insert({
    tenant_id: claims.tenant_id,
    actor_user_id: claims.sub,
    entity_type: 'order',
    entity_id: id,
    action: 'composer_saved',
    diff: { item_count: items.length },
    ts: new Date().toISOString(),
  });

  const next = await loadTenantSalesOrderComposer(db, claims.tenant_id, id, claims);
  if (next === 'notfound' || next === 'forbidden') {
    return NextResponse.json({ error: 'Failed to reload order' }, { status: 500 });
  }

  getPostHogClient()?.capture({
    distinctId: claims.sub ?? claims.tenant_id,
    event: 'sales_order_updated',
    properties: {
      ...withTenantSellerIds(claims),
      order_id: id,
      item_count: items.length,
    },
  });

  return NextResponse.json({ data: next });
}
