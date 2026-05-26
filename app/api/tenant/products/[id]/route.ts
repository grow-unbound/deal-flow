import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { z } from 'zod';

// Fields that can be updated (internal_sku is excluded — immutable)
const UpdateProductSchema = z.object({
  name_override: z.string().optional(),
  mrp: z.coerce.number().positive('MRP must be positive').optional(),
  base_selling_price: z.coerce.number().positive('Base selling price must be positive').optional(),
  cost_price: z.coerce.number().positive().optional().nullable(),
  tenant_brand_id: z.string().uuid().optional().nullable(),
  default_uom: z.string().optional().nullable(),
  pack_size: z.coerce.number().positive().optional().nullable(),
  hsn_code: z.string().optional().nullable(),
  gst_rate: z.coerce.number().min(0).max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  attributes_override: z.record(z.string()).optional(),
  image_urls: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

function computeDiff(
  oldProduct: Record<string, unknown>,
  newFields: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, newVal] of Object.entries(newFields)) {
    if (oldProduct[key] !== newVal) {
      diff[key] = { from: oldProduct[key], to: newVal };
    }
  }
  return diff;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries

    const { data: product, error } = await db
      .schema('app')
      .from('tenant_products')
      .select(`
        id,
        tenant_id,
        tenant_brand_id,
        master_product_id,
        internal_sku,
        name_override,
        mrp,
        base_selling_price,
        cost_price,
        default_uom,
        pack_size,
        hsn_code,
        gst_rate,
        description,
        attributes_override,
        image_urls,
        is_active,
        external_ref,
        created_at,
        updated_at
      `)
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('is_active', true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
    }

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Strip cost_price for seller_assistant
    if (claims.role === 'seller_assistant') {
      const { cost_price: _stripped, ...rest } = product;
      void _stripped;
      return NextResponse.json({ product: rest });
    }

    return NextResponse.json({ product });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const rawBody = await req.json();

    // Strip internal_sku — immutable
    const { internal_sku: _excluded, ...bodyWithoutSku } = rawBody as Record<string, unknown>;
    void _excluded;

    // seller_assistant cannot update cost_price — strip it server-side
    if (claims.role === 'seller_assistant') {
      delete (bodyWithoutSku as Record<string, unknown>).cost_price;
    }

    const parsed = UpdateProductSchema.safeParse(bodyWithoutSku);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updateFields = parsed.data;

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries

    // Verify product belongs to tenant + get current state
    const { data: current, error: fetchError } = await db
      .schema('app')
      .from('tenant_products')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('is_active', true)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
    }

    if (!current) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Compute diff for audit log
    const diff = computeDiff(
      current as Record<string, unknown>,
      updateFields as Record<string, unknown>,
    );

    // Determine action type: status_change when only is_active is being toggled
    const isStatusChangeOnly =
      Object.keys(updateFields).length === 1 && 'is_active' in updateFields;
    const action = isStatusChangeOnly ? 'status_change' : 'update';

    // Resolve actor user id from the Bearer token
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    let actorUserId: string | null = null;
    if (token) {
      const { data: { user } } = await (supabaseAdmin as any).auth.getUser(token);
      actorUserId = user?.id ?? null;
    }

    // Update the product
    const { data: updated, error: updateError } = await db
      .schema('app')
      .from('tenant_products')
      .update({
        ...updateFields,
        updated_at: new Date().toISOString(),
        updated_by: actorUserId ?? claims.tenant_id,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
    }

    // Insert audit log entry (only when something actually changed)
    if (Object.keys(diff).length > 0) {
      await db
        .schema('app')
        .from('audit_log')
        .insert({
          tenant_id: claims.tenant_id,
          actor_user_id: actorUserId,
          entity_type: 'tenant_product',
          entity_id: id,
          action,
          diff,
        });
    }

    return NextResponse.json({ product: updated });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
