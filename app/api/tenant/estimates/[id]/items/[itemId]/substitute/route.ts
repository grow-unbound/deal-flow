import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { computeLineTaxableAmount } from '@/lib/gst';
import { canAccessDocumentLocation } from '@/lib/server/seller-location-access';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });
const BodySchema = z.object({ tenant_product_id: z.string().uuid() });

/**
 * PATCH /api/tenant/estimates/[id]/items/[itemId]/substitute
 *
 * Swaps one estimate line's product for an in-stock alternate — the "Substitute" action
 * on an Inbox enquiry's out-of-stock line. Keeps qty and discount, re-prices from the new
 * product's base selling price and GST rate (the old price was set for a different SKU).
 * Only allowed while the estimate is still editable (draft/sent), same guard as
 * app.estimate_status_is_open.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const parsedParams = ParamsSchema.safeParse(await params);
    if (!parsedParams.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const body = await request.json().catch(() => null);
    const parsedBody = BodySchema.safeParse(body);
    if (!parsedBody.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

    const db = supabaseAdmin as any;
    const { id: estimateId, itemId } = parsedParams.data;
    const { tenant_product_id: newProductId } = parsedBody.data;

    const { data: estimate, error: estimateError } = await db
      .schema('app')
      .from('estimates')
      .select('id, tenant_id, location_id, status')
      .eq('id', estimateId)
      .is('deleted_at', null)
      .maybeSingle();
    if (estimateError || !estimate) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    if (estimate.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (estimate.location_id && !canAccessDocumentLocation(claims, estimate.location_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!['draft', 'sent'].includes(estimate.status)) {
      return NextResponse.json({ error: 'This estimate can no longer be edited' }, { status: 409 });
    }

    const { data: item, error: itemError } = await db
      .schema('app')
      .from('estimate_items')
      .select('id, estimate_id, qty, disc_pct, discount_pct')
      .eq('id', itemId)
      .eq('estimate_id', estimateId)
      .is('deleted_at', null)
      .maybeSingle();
    if (itemError || !item) return NextResponse.json({ error: 'Line item not found' }, { status: 404 });

    const { data: product, error: productError } = await db
      .schema('app')
      .from('tenant_products')
      .select('id, base_selling_price, gst_rate')
      .eq('id', newProductId)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (productError || !product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    const qty = Number(item.qty ?? 0);
    const discPct = Number(item.disc_pct ?? item.discount_pct ?? 0);
    const unitPrice = Number(product.base_selling_price ?? 0);
    const taxPct = Number(product.gst_rate ?? 0);
    const lineTotal = computeLineTaxableAmount({ qty, unit_price: unitPrice, disc_pct: discPct });

    const { error: updateError } = await db
      .schema('app')
      .from('estimate_items')
      .update({
        tenant_product_id: newProductId,
        unit_price: unitPrice,
        tax_pct: taxPct,
        tax_rate: taxPct,
        line_total: lineTotal,
        // The buyer's ask (target price / note) was for the original product; it no
        // longer applies once the line is a different SKU.
        buyer_target_unit_price_min: null,
        buyer_target_unit_price_max: null,
        updated_by: claims.sub,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('estimate_id', estimateId);
    if (updateError) {
      console.error('[PATCH /api/tenant/estimates/[id]/items/[itemId]/substitute]', updateError);
      return NextResponse.json({ error: 'Failed to substitute product' }, { status: 500 });
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error('[PATCH /api/tenant/estimates/[id]/items/[itemId]/substitute]', err);
    return NextResponse.json({ error: 'Failed to substitute product' }, { status: 500 });
  }
}
