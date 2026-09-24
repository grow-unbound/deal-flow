import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { computeLineTaxableAmount } from '@/lib/gst';
import { canAccessDocumentLocation } from '@/lib/server/seller-location-access';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });
const BodySchema = z.object({ unit_price: z.number().min(0) });

/**
 * PATCH /api/tenant/estimates/[id]/items/[itemId]/price
 *
 * Sets one estimate line's unit price -- the seller answering a buyer's target-price ask
 * from the Inbox "Reply / Quote" flow. Unlike substitute (which nulls the buyer's target
 * because the product changed), this keeps buyer_target_unit_price_min/max and buyer_note:
 * the seller is answering that ask, not replacing it. Scope is the price write only --
 * sending the quote to the buyer is a separate action via the existing estimates send route.
 * Only allowed while the estimate is still editable (draft/sent), same guard as substitute.
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
    const { unit_price: unitPrice } = parsedBody.data;

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

    const qty = Number(item.qty ?? 0);
    const discPct = Number(item.disc_pct ?? item.discount_pct ?? 0);
    const lineTotal = computeLineTaxableAmount({ qty, unit_price: unitPrice, disc_pct: discPct });

    const { error: updateError } = await db
      .schema('app')
      .from('estimate_items')
      .update({
        unit_price: unitPrice,
        line_total: lineTotal,
        updated_by: claims.sub,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('estimate_id', estimateId);
    if (updateError) {
      console.error('[PATCH /api/tenant/estimates/[id]/items/[itemId]/price]', updateError);
      return NextResponse.json({ error: 'Failed to save price' }, { status: 500 });
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error('[PATCH /api/tenant/estimates/[id]/items/[itemId]/price]', err);
    return NextResponse.json({ error: 'Failed to save price' }, { status: 500 });
  }
}
