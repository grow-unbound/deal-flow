import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { z } from 'zod';

const UpsertInventorySchema = z.object({
  tenant_product_id: z.string().uuid('Invalid product ID'),
  location_id: z.string().uuid('Invalid location ID'),
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
        location_id,
        qty_available,
        qty_reserved,
        reorder_point,
        updated_at
      `)
      .eq('tenant_product_id', productId);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 });
    }

    // Fetch locations separately to join
    const locationIds = (data ?? []).map((row: { location_id: string }) => row.location_id);
    let locationsMap: Record<string, { id: string; name: string; is_default: boolean }> = {};

    if (locationIds.length > 0) {
      const { data: locs } = await db
        .schema('app')
        .from('locations')
        .select('id, name, is_default')
        .in('id', locationIds)
        .eq('tenant_id', claims.tenant_id);

      locationsMap = Object.fromEntries(
        (locs ?? []).map((l: { id: string; name: string; is_default: boolean }) => [l.id, l]),
      );
    }

    const inventory = (data ?? []).map((row: {
      id: string;
      tenant_product_id: string;
      location_id: string;
      qty_available: number;
      qty_reserved: number;
      reorder_point: number | null;
      updated_at: string;
    }) => ({
      ...row,
      locations: locationsMap[row.location_id] ?? null,
    }));

    return NextResponse.json({ inventory });
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

    const { tenant_product_id, location_id, qty_available, qty_reserved, reorder_point } = parsed.data;

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

    // Verify the location belongs to this tenant
    const { data: location, error: locationError } = await db
      .schema('app')
      .from('locations')
      .select('id')
      .eq('id', location_id)
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    if (locationError || !location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    // Check if row exists (upsert manually since we don't know the constraint name)
    const { data: existing } = await db
      .schema('app')
      .from('tenant_inventory')
      .select('id')
      .eq('tenant_product_id', tenant_product_id)
      .eq('location_id', location_id)
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
          location_id,
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

    return NextResponse.json({ inventory: result });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
