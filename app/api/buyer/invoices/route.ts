import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { BUYER_CACHE_PERSONAL } from '@/lib/server/buyer-cache-headers';

export interface BuyerInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  outstanding_balance: number | null;
  invoice_date: string;
  due_date: string | null;
}

export interface BuyerInvoicesResponse {
  invoices: BuyerInvoice[];
}

export async function GET(request: NextRequest): Promise<NextResponse<BuyerInvoicesResponse>> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ invoices: [] }, { status: 401 });
    }

    if (profile.context.mode === 'preview' && !profile.context.buyer_id) {
      return NextResponse.json({ invoices: [] });
    }

    if (!profile.buyer?.id) {
      return NextResponse.json({ invoices: [] }, { status: 401 });
    }

    const { tenant_id } = profile.context;
    const buyer_id = profile.buyer.id;
    const db = supabaseAdmin ?? supabase;
    const unpaidOnly = request.nextUrl.searchParams.get('unpaid_only') === 'true';
    const defaultLimit = unpaidOnly ? '200' : '50';
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? defaultLimit), 200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (db as any)
      .schema('app')
      .from('invoices')
      .select('id, invoice_number, status, total_amount, outstanding_balance, invoice_date, due_date')
      .eq('tenant_id', tenant_id)
      .eq('buyer_id', buyer_id)
      .is('deleted_at', null);

    if (unpaidOnly) {
      query = query.gt('outstanding_balance', 0);
    }

    const { data, error } = await query
      .order('invoice_date', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[buyer/invoices] GET error:', error.message);
      return NextResponse.json({ invoices: [] });
    }

    const invoices: BuyerInvoice[] = ((data ?? []) as BuyerInvoice[]).map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      status: inv.status,
      total_amount: Number(inv.total_amount ?? 0),
      outstanding_balance: inv.outstanding_balance != null ? Number(inv.outstanding_balance) : null,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date ?? null,
    }));

    return NextResponse.json({ invoices }, { headers: BUYER_CACHE_PERSONAL });
  } catch (err) {
    console.error('[buyer/invoices] Unexpected error:', err);
    return NextResponse.json({ invoices: [] });
  }
}
