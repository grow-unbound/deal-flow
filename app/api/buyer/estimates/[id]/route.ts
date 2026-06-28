import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';

export interface BuyerEstimateItem {
  tenant_product_id: string;
  product_name: string;
  internal_sku: string | null;
  unit: string | null;
  qty: number;
  unit_price: number;
  tax_rate: number | null;
  line_total: number;
}

export interface BuyerEstimateDetail {
  id: string;
  estimate_number: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  total_amount: number;
  subtotal: number;
  tax_total: number;
  items: BuyerEstimateItem[];
}

export interface BuyerEstimateDetailResponse {
  estimate: BuyerEstimateDetail;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id || !profile.buyer?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenant_id } = profile.context;
    const buyer_id = profile.buyer.id;
    const db = supabaseAdmin ?? supabase;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: estimate, error } = await (db as any)
      .schema('app')
      .from('estimates')
      .select(`
        id, estimate_number, status, notes, created_at, total_amount,
        estimate_items (
          tenant_product_id, qty, unit_price, tax_rate, line_total,
          tenant_products ( name, internal_sku, unit )
        )
      `)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .eq('buyer_id', buyer_id)
      .is('deleted_at', null)
      .single();

    if (error || !estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }

    const rawItems: BuyerEstimateItem[] = ((estimate.estimate_items as any[]) ?? [])
      .filter((ei: any) => !ei.deleted_at)
      .map((ei: any) => ({
        tenant_product_id: ei.tenant_product_id,
        product_name: ei.tenant_products?.name ?? 'Unknown product',
        internal_sku: ei.tenant_products?.internal_sku ?? null,
        unit: ei.tenant_products?.unit ?? null,
        qty: Number(ei.qty),
        unit_price: Number(ei.unit_price),
        tax_rate: ei.tax_rate != null ? Number(ei.tax_rate) : null,
        line_total: Number(ei.line_total),
      }));

    const subtotal = rawItems.reduce((sum, i) => sum + i.line_total, 0);
    // Estimates don't have tax applied; keep tax_total = 0 unless total differs
    const tax_total = Math.max(0, Number(estimate.total_amount) - subtotal);

    const detail: BuyerEstimateDetail = {
      id: estimate.id,
      estimate_number: estimate.estimate_number ?? null,
      status: estimate.status,
      notes: estimate.notes ?? null,
      created_at: estimate.created_at,
      total_amount: Number(estimate.total_amount),
      subtotal,
      tax_total,
      items: rawItems,
    };

    return NextResponse.json({ estimate: detail });
  } catch (err) {
    console.error('[buyer/estimates/[id]] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
