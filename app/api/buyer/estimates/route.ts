import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { getPostHogClient } from '@/lib/posthog-server';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { fetchWhatsappNotificationContext } from '@/lib/server/notification-context';
import { sendRequestReceivedBuyer, sendRequestReceivedSeller } from '@/lib/server/whatsapp';
import { PAGE_SIZE, encodeCursor, decodeCursor } from '@/lib/pagination';

// Exported types consumed by checkout/page.tsx and EnquiriesTab
export interface EstimateRequest {
  items: Array<{
    tenant_product_id: string;
    qty: number;
    unit_price: number;
    product_name?: string;
  }>;
  notes?: string;
  catalog_id?: string | null;
  location_id?: string | null;
  delivery_address?: Record<string, unknown> | null;
}

export interface EstimateResponse {
  success: boolean;
  estimate_id?: string;
  estimate_number?: string | null;
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

    const { items, notes, catalog_id, location_id, delivery_address } = body;

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
    const total_amount = subtotal;

    if (context.mode === 'preview' && !context.buyer_id) {
      return NextResponse.json({
        success: true,
        estimate_id: `preview-${Date.now()}`,
        estimate_number: 'PREVIEW-INQUIRY',
        whatsapp_sent: false,
      });
    }

    if (!profile.buyer?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenant_id = context.tenant_id;
    const buyer_id = profile.buyer.id;
    const { sub } = context;
    const db = supabaseAdmin ?? supabase;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const sortedItems = [...items].sort((a, b) => a.tenant_product_id.localeCompare(b.tenant_product_id));
    const cart_hash = createHash('sha256')
      .update(JSON.stringify(sortedItems.map((i) => ({ id: i.tenant_product_id, qty: i.qty, price: i.unit_price }))))
      .digest('hex');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRows } = await (db as any)
      .schema('app')
      .from('estimates')
      .select('id, estimate_number')
      .eq('buyer_id', buyer_id)
      .eq('cart_hash', cart_hash)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .is('deleted_at', null)
      .limit(1);

    const existing = (existingRows as Array<{ id: string; estimate_number: string | null }> | null)?.[0];
    if (existing) {
      return NextResponse.json({ success: true, estimate_id: existing.id, estimate_number: existing.estimate_number, whatsapp_sent: false });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: estimateCount } = await (db as any)
      .schema('app')
      .from('estimates')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id);

    const year = new Date().getFullYear();
    const paddedCount = String((estimateCount ?? 0) + 1).padStart(4, '0');
    const estimate_number = `EST-${year}-${paddedCount}`;

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
        expires_at: expiresAt,
        subtotal,
        total_amount,
        cart_hash,
        notes: notes ?? null,
        catalog_id: catalog_id ?? null,
        location_id: location_id ?? null,
        delivery_address: delivery_address ?? null,
        created_by: sub,
      })
      .select('id, estimate_number')
      .single();

    if (insertError || !newEstimate) {
      console.error('[buyer/estimates] Insert error:', insertError);
      return NextResponse.json({ success: false, error: 'Failed to create estimate' }, { status: 500 });
    }

    const typed = newEstimate as { id: string; estimate_number: string | null };

    const estimateItemRows = items.map((item) => ({
      estimate_id: typed.id,
      tenant_product_id: item.tenant_product_id,
      qty: item.qty,
      unit_price: item.unit_price,
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
          item_count: items.length,
          total_amount,
          source: 'buyer_app',
        },
      });
      await ph.flush();
    } catch {
      // non-blocking
    }

    // Fire WhatsApp notifications without blocking the response
    void (async () => {
      try {
        const ctx = await fetchWhatsappNotificationContext(
          tenant_id!,
          buyer_id,
          location_id ?? null,
          'enquiry_received',
        );
        if (ctx) {
          await Promise.allSettled([
            sendRequestReceivedBuyer(ctx, typed.id, typed.estimate_number ?? '', total_amount, items.length),
            sendRequestReceivedSeller(ctx, typed.id, typed.estimate_number ?? '', total_amount, items.length),
          ]);
        }
      } catch {
        // non-blocking — estimate creation already succeeded
      }
    })();

    return NextResponse.json({ success: true, estimate_id: typed.id, estimate_number: typed.estimate_number, whatsapp_sent: true });
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
      return NextResponse.json({ estimates: [] });
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

    return NextResponse.json({ estimates, nextCursor, total: (countRes as { count: number | null }).count ?? null });
  } catch (err) {
    console.error('[buyer/estimates] GET unexpected error:', err);
    return NextResponse.json({ estimates: [], nextCursor: null, total: null });
  }
}
