import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { getPostHogClient } from '@/lib/posthog-server';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { getInAppCreateFlags } from '@/lib/server/seller-features';
import { sendImmediateTransactionNotifications } from '@/lib/server/buyer-transaction-notify-immediate';
import { tenantDefersTransactionNumber } from '@/lib/server/transaction-outbound-push';
import {
  formatProvisionalEstimateNumber,
  nextProvisionalEstimateSequence,
} from '@/lib/server/transaction-numbers';
import { BUYER_CACHE_PERSONAL } from '@/lib/server/buyer-cache-headers';
import { recordBuyerAppActivitySafe } from '@/lib/server/buyer-app-activity';
import { inferCampaignIdForBuyerCart } from '@/lib/server/campaign-attribution';
import { PAGE_SIZE, encodeCursor, decodeCursor } from '@/lib/pagination';
import { resolveBuyerInventoryWarehouseId } from '@/lib/server/buyer-product-data';
import { validateBuyerCartStock } from '@/lib/server/buyer-cart-stock';
import { getSelectedBuyerDeliveryFromRequest } from '@/lib/server/buyer-location-selection';
import { deriveBuyerPlaceOfSupply } from '@/lib/buyer-routing';
import { TRANSACTION_PENDING_NOTE } from '@/lib/transaction-notes';

// Exported types consumed by checkout/page.tsx and EnquiriesTab
export interface EstimateRequest {
  items: Array<{
    tenant_product_id: string;
    qty: number;
    unit_price: number;
    gst_rate?: number | null;
    product_name?: string;
  }>;
  notes?: string;
  campaign_id?: string | null;
  location_id?: string | null;
  place_of_supply?: string | null;
}

export interface EstimateResponse {
  success: boolean;
  estimate_id?: string;
  estimate_number?: string | null;
  document_url?: string | null;
  document_status_note?: string | null;
  whatsapp_sent?: boolean;
  error?: string;
}

interface EstimateRow {
  id: string;
  estimate_number: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  notes: string | null;
}

async function loadBuyerBusinessPolicy(db: any, tenantId: string) {
  const { data } = await db
    .schema('app')
    .from('tenant_settings')
    .select('settings')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const rawSettings = (data as { settings?: Record<string, unknown> } | null)?.settings ?? {};
  const rawPolicy = (rawSettings.business_policy ?? {}) as Record<string, unknown>;
  return {
    gst_inclusive: rawPolicy.gst_inclusive === true,
    gst_rate: typeof rawPolicy.gst_rate === 'number' ? rawPolicy.gst_rate : 18,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<EstimateResponse>> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const context = profile.context;

    let body: EstimateRequest;
    try {
      body = (await request.json()) as EstimateRequest;
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { items, notes, campaign_id, location_id } = body;

    const createFlags = await getInAppCreateFlags(context.tenant_id!);
    if (!createFlags.create_enquiries) {
      return NextResponse.json({ success: false, error: 'Estimate creation is not available' }, { status: 403 });
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

    if (context.mode === 'preview' && !context.buyer_id) {
      return NextResponse.json({
        success: true,
        estimate_id: `preview-${Date.now()}`,
        estimate_number: 'PREVIEW-INQUIRY',
        document_url: null,
        document_status_note: null,
        whatsapp_sent: false,
      });
    }

    if (!profile.buyer?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const selectedDelivery = getSelectedBuyerDeliveryFromRequest(request);
    const routedLocationId = selectedDelivery?.routed_location_id ?? location_id ?? null;

    if (!routedLocationId) {
      return NextResponse.json(
        { success: false, error: 'Select a delivery location before requesting a quote' },
        { status: 400 },
      );
    }

    const tenant_id = context.tenant_id;
    const sub = context.sub;
    if (!tenant_id || !sub) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const buyer_id = profile.buyer.id;
    const db = supabaseAdmin ?? supabase;
    const inventoryWarehouseId = await resolveBuyerInventoryWarehouseId(db as any, request, profile);
    const stockValidation = await validateBuyerCartStock(db as any, {
      tenantId: tenant_id,
      warehouseId: inventoryWarehouseId,
      items,
      enforceStock: false,
    });
    if (!stockValidation.ok) {
      return NextResponse.json(
        { success: false, error: stockValidation.error },
        { status: stockValidation.status },
      );
    }
    const acceptedItems = stockValidation.items;

    const resolvedCampaignId = await inferCampaignIdForBuyerCart(db, {
      tenantId: tenant_id,
      buyerId: buyer_id,
      clientCampaignId: campaign_id,
      tenantProductIds: acceptedItems.map((item) => item.tenant_product_id),
    });

    const policy = await loadBuyerBusinessPolicy(db as typeof supabaseAdmin, tenant_id);
    const subtotal = acceptedItems.reduce((sum, item) => sum + item.qty * item.unit_price, 0);
    const tax_amount = policy.gst_inclusive
      ? 0
      : acceptedItems.reduce((sum, item) => {
          const rate = Number(item.gst_rate ?? policy.gst_rate);
          return sum + item.qty * item.unit_price * (Number.isFinite(rate) ? rate / 100 : 0);
        }, 0);
    const total_amount = subtotal + tax_amount;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const sortedItems = [...acceptedItems].sort((a, b) => a.tenant_product_id.localeCompare(b.tenant_product_id));
    const placeOfSupply = selectedDelivery?.place_of_supply
      || (selectedDelivery ? deriveBuyerPlaceOfSupply(selectedDelivery) : '')
      || (typeof body.place_of_supply === 'string' && body.place_of_supply.trim())
      || 'Unknown';
    const cart_hash = createHash('sha256')
      .update(JSON.stringify({
          items: sortedItems.map((i) => ({ id: i.tenant_product_id, qty: i.qty, price: i.unit_price })),
        location_id: routedLocationId,
        place_of_supply: placeOfSupply,
      }))
      .digest('hex');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRows } = await (db as any)
      .schema('app')
      .from('estimates')
      .select('id, estimate_number, campaign_id')
      .eq('buyer_id', buyer_id)
      .eq('cart_hash', cart_hash)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .is('deleted_at', null)
      .limit(1);

    const existing = (existingRows as Array<{ id: string; estimate_number: string | null; campaign_id: string | null }> | null)?.[0];
    if (existing) {
      if (!existing.campaign_id && resolvedCampaignId) {
        await (db as any)
          .schema('app')
          .from('estimates')
          .update({ campaign_id: resolvedCampaignId })
          .eq('id', existing.id);
      }
      return NextResponse.json({
        success: true,
        estimate_id: existing.id,
        estimate_number: existing.estimate_number,
        document_status_note: existing.estimate_number ? null : TRANSACTION_PENDING_NOTE,
        whatsapp_sent: false,
      });
    }

    const deferDocumentNumber = await tenantDefersTransactionNumber(tenant_id, 'estimates');

    const estimate_number = deferDocumentNumber
      ? null
      : formatProvisionalEstimateNumber(await nextProvisionalEstimateSequence(db, tenant_id));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newEstimate, error: insertError } = await (db as any)
      .schema('app')
      .from('estimates')
      .insert({
        tenant_id,
        buyer_id,
        estimate_number,
        status: 'draft',
        source: 'buyer_app',
        is_buyer_app_estimate: true,
        expires_at: expiresAt,
        subtotal,
        total_amount,
        cart_hash,
        notes: notes ?? null,
        campaign_id: resolvedCampaignId,
        location_id: routedLocationId,
        place_of_supply: placeOfSupply,
        created_by: sub,
      })
      .select('id, estimate_number')
      .single();

    if (insertError || !newEstimate) {
      console.error('[buyer/estimates] Insert error:', insertError);
      return NextResponse.json({ success: false, error: 'Failed to create estimate' }, { status: 500 });
    }

    const typed = newEstimate as { id: string; estimate_number: string | null };

    const estimateItemRows = acceptedItems.map((item) => ({
      estimate_id: typed.id,
      tenant_product_id: item.tenant_product_id,
      qty: item.qty,
      unit_price: item.unit_price,
      tax_rate: item.gst_rate ?? policy.gst_rate,
      line_total: item.qty * item.unit_price,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: itemsError } = await (db as any).schema('app').from('estimate_items').insert(estimateItemRows);
    if (itemsError) {
      console.error('[buyer/estimates] Items insert error:', itemsError);
    }

    try {
      const ph = getPostHogClient();
      ph.capture({
        distinctId: buyer_id,
        event: 'inquiry_created',
        properties: {
          tenant_id: context.tenant_id,
          buyer_id,
          estimate_id: typed.id,
          estimate_number: typed.estimate_number,
          item_count: acceptedItems.length,
          total_amount,
          source: 'buyer_app',
        },
      });
      await ph.flush();
    } catch {
      // non-blocking
    }

    let whatsappSent = false;
    if (!deferDocumentNumber && typed.estimate_number) {
      try {
        whatsappSent = await sendImmediateTransactionNotifications({
          kind: 'estimate',
          tenantId: tenant_id,
          buyerId: buyer_id,
          locationId: routedLocationId,
          initiatingBuyerUserId: context.sub,
          documentId: typed.id,
          documentNumber: typed.estimate_number,
          totalAmount: total_amount,
          itemCount: acceptedItems.length,
          db,
          table: 'estimates',
        });
      } catch (err) {
        console.error('[buyer/estimates] whatsapp notify failed', {
          estimate_id: typed.id,
          error: err instanceof Error ? err.message : String(err),
        });
        // non-blocking — estimate creation already succeeded
      }
    }

    void recordBuyerAppActivitySafe(db as any, {
      tenantId: tenant_id,
      buyerId: buyer_id,
      eventName: 'estimate_created',
      path: request.nextUrl.pathname,
      context: {
        estimate_id: typed.id,
        estimate_number: typed.estimate_number,
        item_count: acceptedItems.length,
        total_amount,
      },
    });

    return NextResponse.json({
      success: true,
      estimate_id: typed.id,
      estimate_number: typed.estimate_number,
      document_url: null,
      document_status_note: typed.estimate_number ? null : TRANSACTION_PENDING_NOTE,
      whatsapp_sent: whatsappSent,
    });
  } catch (err) {
    console.error('[buyer/estimates] Unexpected error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const context = profile.context;

    if (context.mode === 'preview' && !context.buyer_id) {
      return NextResponse.json({ estimates: [] }, { headers: BUYER_CACHE_PERSONAL });
    }

    if (!profile.buyer?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant_id = context.tenant_id;
    const buyer_id = profile.buyer.id;
    const db = supabaseAdmin ?? supabase;
    const { searchParams } = request.nextUrl;
    const reqLimit = Math.min(Number(searchParams.get('limit') ?? PAGE_SIZE.BUYER), PAGE_SIZE.MAX);
    const cursorParam = searchParams.get('cursor');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (db as any)
      .schema('app')
      .from('estimates')
      .select('id, estimate_number, status, total_amount, created_at, notes')
      .eq('tenant_id', tenant_id)
      .eq('buyer_id', buyer_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(reqLimit + 1);

    if (cursorParam) {
      const { created_at, id } = decodeCursor(cursorParam);
      query = query.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data, error }, countRes] = await Promise.all([
      query,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .schema('app')
        .from('estimates')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id)
        .eq('buyer_id', buyer_id)
        .is('deleted_at', null),
    ]);

    if (error) {
      console.warn('[buyer/estimates] GET error (table may not exist yet):', error.message);
      return NextResponse.json({ estimates: [], nextCursor: null, total: null });
    }

    const rawRows = ((data ?? []) as EstimateRow[]);
    const hasNextPage = rawRows.length > reqLimit;
    const rows = hasNextPage ? rawRows.slice(0, reqLimit) : rawRows;
    const lastRow = rows.at(-1);
    const nextCursor = hasNextPage && lastRow
      ? encodeCursor({ created_at: lastRow.created_at, id: lastRow.id })
      : null;

    const estimates = rows.map((e) => ({
      id: e.id,
      estimate_number: e.estimate_number,
      status: e.status,
      total_amount: Number(e.total_amount ?? 0),
      created_at: e.created_at,
      notes: e.notes ?? null,
    }));

    return NextResponse.json(
      { estimates, nextCursor, total: (countRes as { count: number | null }).count ?? null },
      { headers: BUYER_CACHE_PERSONAL },
    );
  } catch (err) {
    console.error('[buyer/estimates] GET unexpected error:', err);
    return NextResponse.json({ estimates: [], nextCursor: null, total: null });
  }
}
