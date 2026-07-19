import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { loadEstimateDocument } from '@/lib/estimates/load-tenant-estimate-composer';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { getBuyerDocumentSendState } from '@/lib/server/whatsapp-document-send';
import {
  isSellerLocationSelectionAllowed,
  loadAccessibleSellerLocations,
  resolveDefaultSellerLocationId,
} from '@/lib/server/seller-location-access';
import { supabaseAdmin } from '@/lib/supabase';
import type { EstimateComposerDocument } from '@/types/estimate-composer';

type DbClient = any;

const EstimateSaveSchema = z.object({
  estimate_number: z.string().min(1).optional(),
  buyer_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  estimate_date: z.string().optional(),
  valid_until: z.string().optional(),
  buyer_po_ref: z.string().max(255).optional(),
  place_of_supply: z.string().max(120).optional(),
  seller_note: z.string().max(8000).optional(),
  freight: z.number().min(0).optional(),
  discount_flat: z.number().min(0).optional(),
  round_off: z.number().optional(),
  items: z.array(
    z.object({
      id: z.string().optional(),
      tenant_product_id: z.string().uuid(),
      qty: z.number().positive(),
      unit_price: z.number().min(0),
      disc_pct: z.number().min(0).max(100),
      tax_pct: z.number().min(0).max(100),
      item_order: z.number().int().positive().optional().nullable(),
      scheme_tag: z.string().nullable().optional(),
    }),
  ).optional(),
});


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, estimatesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
    ]);
    if (!orderMgmt || !estimatesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const result = await loadEstimateDocument(supabaseAdmin as DbClient, claims.tenant_id, id, claims.role, claims);
    if (!result) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }
    if (result === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const whatsappSend = await getBuyerDocumentSendState(supabaseAdmin as DbClient, {
      kind: 'estimate',
      tenantId: claims.tenant_id,
      buyerId: result.composerPayload.buyer_id,
    });
    return NextResponse.json({
      data: {
        ...result.detailPayload,
        historical_items: result.detailPayload.items,
        ...result.composerPayload,
        whatsapp_send: whatsappSend,
      },
    }, { headers: SELLER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/tenant/estimates/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ data: EstimateComposerDocument } | { error: string }>> {
  const { id } = await params;
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, estimatesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
    ]);
    if (!orderMgmt || !estimatesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = EstimateSaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as DbClient;
    const existing = await loadEstimateDocument(db, claims.tenant_id, id, claims.role, claims);
    if (!existing) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }
    if (existing === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = parsed.data;
    const allowedLocations = await loadAccessibleSellerLocations(db as any, claims.tenant_id, claims);
    const nextLocationId = payload.location_id ?? existing.composerPayload.location_id ?? resolveDefaultSellerLocationId(claims, allowedLocations);
    if (!nextLocationId || !isSellerLocationSelectionAllowed(claims, nextLocationId)) {
      return NextResponse.json({ error: 'Select a valid accessible location' }, { status: 400 });
    }
    const items = payload.items ?? existing.composerPayload.items;
    const subtotal = items.reduce((sum, row) => {
      const discounted = row.qty * row.unit_price * (1 - row.disc_pct / 100);
      return sum + discounted;
    }, 0);
    const taxAmount = items.reduce((sum, row) => {
      const taxable = row.qty * row.unit_price * (1 - row.disc_pct / 100);
      return sum + taxable * (row.tax_pct / 100);
    }, 0);
    const discountFlat = payload.discount_flat ?? existing.composerPayload.discount_flat;
    const freight = payload.freight ?? existing.composerPayload.freight;
    const roundOff = payload.round_off ?? existing.composerPayload.round_off;
    const grandTotal = Math.max(subtotal - discountFlat, 0) + taxAmount + freight + roundOff;
    const validUntil = payload.valid_until ?? existing.composerPayload.valid_until;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: claims.sub,
      location_id: nextLocationId,
      subtotal,
      tax_amount: taxAmount,
      total_amount: grandTotal,
      expires_at: validUntil ? `${validUntil}T23:59:59.000Z` : null,
    };
    if (payload.estimate_number !== undefined) updatePayload.estimate_number = payload.estimate_number;
    if (payload.buyer_id !== undefined) updatePayload.buyer_id = payload.buyer_id;
    if (payload.estimate_date !== undefined) updatePayload.estimate_date = payload.estimate_date;
    if (payload.valid_until !== undefined) updatePayload.valid_until = payload.valid_until;
    if (payload.buyer_po_ref !== undefined) updatePayload.buyer_po_ref = payload.buyer_po_ref || null;
    if (payload.place_of_supply !== undefined) {
      const trimmed = typeof payload.place_of_supply === 'string' ? payload.place_of_supply.trim() : '';
      updatePayload.place_of_supply = trimmed.length > 0 ? trimmed : '';
    }
    if (payload.seller_note !== undefined) updatePayload.notes = payload.seller_note || null;
    if (payload.discount_flat !== undefined) updatePayload.discount_flat = payload.discount_flat;
    if (payload.freight !== undefined) updatePayload.freight = payload.freight;
    if (payload.round_off !== undefined) updatePayload.round_off = payload.round_off;

    if (existing.composerPayload.status === 'sent') {
      updatePayload.estimate_version = Number(existing.composerPayload.estimate_version ?? 1) + 1;
    }

    const updateRes = await (db as any)
      .schema('app')
      .from('estimates')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    if (updateRes.error) {
      console.error('[PATCH /api/tenant/estimates/[id]] update error', updateRes.error);
      return NextResponse.json({ error: 'Failed to update estimate' }, { status: 500 });
    }

    if (payload.items) {
      const existingItemIds = new Set(existing.composerPayload.items.map((row) => row.id));
      const nextIds = new Set(payload.items.map((row) => row.id).filter((value): value is string => Boolean(value)));

      for (const staleId of existingItemIds) {
        if (!nextIds.has(staleId)) {
          await (db as any)
            .schema('app')
            .from('estimate_items')
            .update({ deleted_at: new Date().toISOString(), updated_by: claims.sub, updated_at: new Date().toISOString() })
            .eq('id', staleId)
            .eq('estimate_id', id);
        }
      }

      for (const item of payload.items) {
        const discounted = item.qty * item.unit_price * (1 - item.disc_pct / 100);
        const patch = {
          estimate_id: id,
          tenant_product_id: item.tenant_product_id,
          qty: item.qty,
          unit_price: item.unit_price,
          discount_pct: item.disc_pct,
          disc_pct: item.disc_pct,
          tax_rate: item.tax_pct,
          tax_pct: item.tax_pct,
          line_total: discounted + discounted * (item.tax_pct / 100),
          item_order: item.item_order ?? null,
          scheme_tag: item.scheme_tag ?? null,
          updated_at: new Date().toISOString(),
          updated_by: claims.sub,
          deleted_at: null,
        };

        if (item.id && existingItemIds.has(item.id)) {
          await (db as any)
            .schema('app')
            .from('estimate_items')
            .update(patch)
            .eq('id', item.id)
            .eq('estimate_id', id);
        } else {
          await (db as any)
            .schema('app')
            .from('estimate_items')
            .insert({
              ...patch,
              created_by: claims.sub,
            });
        }
      }
    }

    await (db as any).schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'estimate',
      entity_id: id,
      action: 'composer_saved',
      diff: {
        estimate_number: payload.estimate_number,
        buyer_id: payload.buyer_id,
        item_count: items.length,
      },
      ts: new Date().toISOString(),
    });

    const next = await loadEstimateDocument(db, claims.tenant_id, id, claims.role, claims);
    if (!next || next === 'forbidden') {
      return NextResponse.json({ error: 'Failed to reload estimate' }, { status: 500 });
    }

    return NextResponse.json({ data: next.composerPayload });
  } catch (error) {
    console.error('[PATCH /api/tenant/estimates/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
