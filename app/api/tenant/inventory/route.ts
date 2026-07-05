import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { revalidateSellerDashboardCache } from '@/lib/server/dashboard-cache';
import { SELLER_CACHE_NONE } from '@/lib/server/bounded-get';
import { z } from 'zod';

const UpsertInventorySchema = z.object({
  tenant_product_id: z.string().uuid('Invalid product ID'),
  warehouse_id: z.string().uuid('Invalid warehouse ID'),
  qty_available: z.number().min(0, 'qty_available must be >= 0'),
  qty_reserved: z.number().min(0, 'qty_reserved must be >= 0'),
  reorder_point: z.number().min(0).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const productId = req.nextUrl.searchParams.get('product_id');
    if (!productId) {
      return NextResponse.json({ error: 'product_id query param is required' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // Verify the product belongs to this tenant
    const { data: product, error: productError } = await db
      .schema('app')
      .from('tenant_products')
      .select('id')
      .eq('id', productId)
      .eq('tenant_id', claims.tenant_id)
      .is('is_active', true)
      .maybeSingle();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { data, error } = await db
      .schema('app')
      .from('tenant_inventory')
      .select(`
        id,
        tenant_product_id,
        warehouse_id,
        qty_available,
        qty_reserved,
        reorder_point,
        updated_at
      `)
      .eq('tenant_product_id', productId);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 });
    }

    const warehouseIds = (data ?? []).map((row: { warehouse_id: string }) => row.warehouse_id);
    let warehousesMap: Record<string, { id: string; name: string; is_default: boolean; location_id: string | null }> = {};

    if (warehouseIds.length > 0) {
      const { data: warehouses } = await db
        .schema('app')
        .from('warehouses')
        .select('id, name, is_default, location_id')
        .in('id', warehouseIds)
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null);

      warehousesMap = Object.fromEntries(
        (warehouses ?? []).map((warehouse: { id: string; name: string; is_default: boolean; location_id: string | null }) => [warehouse.id, warehouse]),
      );
    }

    const inventory = (data ?? []).map((row: {
      id: string;
      tenant_product_id: string;
      warehouse_id: string;
      qty_available: number;
      qty_reserved: number;
      reorder_point: number | null;
      updated_at: string;
    }) => ({
      ...row,
      warehouse: warehousesMap[row.warehouse_id] ?? null,
    }));

    return NextResponse.json({ inventory }, { headers: SELLER_CACHE_NONE });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await req.json();
    const parsed = UpsertInventorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point } = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // Verify the product belongs to this tenant
    const { data: product, error: productError } = await db
      .schema('app')
      .from('tenant_products')
      .select('id')
      .eq('id', tenant_product_id)
      .eq('tenant_id', claims.tenant_id)
      .is('is_active', true)
      .maybeSingle();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { data: warehouse, error: warehouseError } = await db
      .schema('app')
      .from('warehouses')
      .select('id')
      .eq('id', warehouse_id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (warehouseError || !warehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    // Check if row exists (upsert manually since we don't know the constraint name)
    const { data: existing } = await db
      .schema('app')
      .from('tenant_inventory')
      .select('id')
      .eq('tenant_product_id', tenant_product_id)
      .eq('warehouse_id', warehouse_id)
      .maybeSingle();

    let result;

    if (existing?.id) {
      // UPDATE
      const { data: updated, error: updateError } = await db
        .schema('app')
        .from('tenant_inventory')
        .update({
          qty_available,
          qty_reserved,
          reorder_point: reorder_point ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update inventory' }, { status: 500 });
      }
      result = updated;
    } else {
      // INSERT
      const { data: inserted, error: insertError } = await db
        .schema('app')
        .from('tenant_inventory')
        .insert({
          tenant_product_id,
          warehouse_id,
          qty_available,
          qty_reserved,
          reorder_point: reorder_point ?? null,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: 'Failed to create inventory record' }, { status: 500 });
      }
      result = inserted;
    }

    revalidateSellerDashboardCache(claims.tenant_id);
    return NextResponse.json({ inventory: result });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
