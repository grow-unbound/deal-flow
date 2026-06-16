import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { requireBuyerAccessProfile, getVisibleBuyerCatalogs } from '@/lib/server/buyer-access';

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

    if (!q) {
      return NextResponse.json({ items: [], scope });
    }

    const db = supabaseAdmin ?? supabase;
    const items: BuyerSearchItem[] = [];

    if (scope === 'catalog') {
      // Resolve which product IDs are visible to this buyer
      let allowedProductIds: string[] | null = null;
      if (profile.context.mode === 'buyer' && buyer_id && tenant_id) {
        try {
          const catalogs = await getVisibleBuyerCatalogs(tenant_id, buyer_id);
          if (catalogs.length > 0) {
            const catalogIds = catalogs.map((c: { id: string }) => c.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: catItems } = await (db as any)
              .schema('app')
              .from('published_catalog_items')
              .select('tenant_product_id')
              .in('catalog_id', catalogIds);
            allowedProductIds = ((catItems ?? []) as { tenant_product_id: string }[]).map((ci) => ci.tenant_product_id);
          }
        } catch {
          allowedProductIds = null;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let productQuery = (db as any)
        .schema('app')
        .from('tenant_products')
        .select('id, name_override, internal_sku')
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .or(`name_override.ilike.%${q}%,internal_sku.ilike.%${q}%`)
        .limit(20);

      if (allowedProductIds && allowedProductIds.length > 0) {
        productQuery = productQuery.in('id', allowedProductIds);
      }

      const { data: products } = await productQuery;
      for (const p of (products ?? [])) {
        items.push({
          id:          p.id,
          entity_type: 'product',
          label:       p.name_override ?? p.internal_sku ?? '',
          sublabel:    p.internal_sku ?? '',
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

    return NextResponse.json({ items, scope });
  } catch (err) {
    console.error('[buyer/search] error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
