import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { BUYER_CACHE_CATALOG, BUYER_CACHE_PERSONAL } from '@/lib/server/buyer-cache-headers';
import { searchScopedProducts } from '@/lib/server/scoped-product-search';

export interface BuyerSearchItem {
  id: string;
  entity_type: string;
  label: string;
  sublabel: string;
  meta?: string;
}

export interface BuyerSearchResponse {
  items: BuyerSearchItem[];
  scope: 'catalog' | 'orders';
}

export async function GET(request: NextRequest): Promise<NextResponse<BuyerSearchResponse | { error: string }>> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenant_id, buyer_id } = profile.context;
    const scope = (request.nextUrl.searchParams.get('scope') ?? 'catalog') as 'catalog' | 'orders';
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    const cacheHeaders = scope === 'orders' ? BUYER_CACHE_PERSONAL : BUYER_CACHE_CATALOG;

    if (!q) {
      return NextResponse.json({ items: [], scope }, { headers: cacheHeaders });
    }

    const db = supabaseAdmin ?? supabase;
    const items: BuyerSearchItem[] = [];

    if (scope === 'catalog') {
      const allowedTenantBrandIds =
        profile.context.mode === 'buyer' && buyer_id && tenant_id
          ? await resolveBuyerAllowedTenantBrandIds(db as any, tenant_id, buyer_id)
          : null;

      const { rows } = await searchScopedProducts({
        db: db as any,
        tenantId: tenant_id,
        buyerId: buyer_id,
        query: q,
        limit: 20,
        allowedBrandIds: allowedTenantBrandIds,
      });

      for (const p of rows) {
        items.push({
          id:          p.tenant_product_id,
          entity_type: 'product',
          label:       p.product_name ?? p.sku ?? '',
          sublabel:    p.sku ?? '',
        });
      }
    }

    if (scope === 'orders' && buyer_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orders } = await (db as any)
        .schema('app')
        .from('orders')
        .select('id, order_number, status, total_amount')
        .eq('tenant_id', tenant_id)
        .eq('buyer_id', buyer_id)
        .is('deleted_at', null)
        .ilike('order_number', `%${q}%`)
        .limit(10);

      for (const o of (orders ?? [])) {
        items.push({ id: o.id, entity_type: 'order', label: o.order_number, sublabel: o.status, meta: String(o.total_amount ?? 0) });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: estimates } = await (db as any)
        .schema('app')
        .from('estimates')
        .select('id, estimate_number, status, total_amount')
        .eq('tenant_id', tenant_id)
        .eq('buyer_id', buyer_id)
        .is('deleted_at', null)
        .ilike('estimate_number', `%${q}%`)
        .limit(10);

      for (const e of (estimates ?? [])) {
        items.push({ id: e.id, entity_type: 'estimate', label: e.estimate_number ?? '', sublabel: e.status, meta: String(e.total_amount ?? 0) });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: invoices } = await (db as any)
        .schema('app')
        .from('invoices')
        .select('id, invoice_number, status, total_amount')
        .eq('tenant_id', tenant_id)
        .eq('buyer_id', buyer_id)
        .is('deleted_at', null)
        .ilike('invoice_number', `%${q}%`)
        .limit(10);

      for (const inv of (invoices ?? [])) {
        items.push({ id: inv.id, entity_type: 'invoice', label: inv.invoice_number, sublabel: inv.status, meta: String(inv.total_amount ?? 0) });
      }
    }

    return NextResponse.json({ items, scope }, { headers: cacheHeaders });
  } catch (err) {
    console.error('[buyer/search] error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
