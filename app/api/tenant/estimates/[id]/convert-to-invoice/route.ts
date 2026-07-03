import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { getInAppCreateFlags } from '@/lib/server/seller-features';
import { supabaseAdmin } from '@/lib/supabase';

const AddedLineSchema = z.object({
  tenant_product_id: z.string().uuid(),
  qty: z.number().positive(),
  unit_price: z.number().nonnegative(),
  disc_pct: z.number().min(0).max(100).default(0),
  tax_pct: z.number().min(0).max(100).default(0),
});

const ConvertToInvoiceBodySchema = z.object({
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  line_ids: z.array(z.string().uuid()),
  qty_overrides: z.record(z.string().uuid(), z.number().positive()).optional(),
  invoice_number: z.string().min(1).max(64).optional(),
  added_lines: z.array(AddedLineSchema).optional(),
}).refine((d) => d.line_ids.length > 0 || (d.added_lines && d.added_lines.length > 0), {
  message: 'At least one line or added product is required',
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ data: Record<string, unknown> } | { error: string }>> {
  const { id } = await params;
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, estimatesFlag, createFlags] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
      getInAppCreateFlags(claims.tenant_id),
    ]);

    if (!orderMgmt || !estimatesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }
    if (!createFlags.create_invoices) {
      return NextResponse.json({ error: 'Invoice creation is disabled for this tenant' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = ConvertToInvoiceBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;

    const { data: estimate, error: estimateError } = await db
      .schema('app')
      .from('estimates')
      .select('id, tenant_id, status')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (estimateError || !estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }
    if (estimate.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const rpcInput: Record<string, unknown> = {
      p_tenant_id: claims.tenant_id,
      p_estimate_id: id,
      p_actor_user_id: claims.sub,
      p_qty_overrides: parsed.data.qty_overrides ?? {},
      p_invoice_date: parsed.data.invoice_date,
      p_invoice_number_override: parsed.data.invoice_number ?? null,
    };
    if (parsed.data.line_ids.length > 0) {
      rpcInput.p_line_ids = parsed.data.line_ids;
    }

    const { data, error } = await db.schema('app').rpc('estimate_convert_to_invoice', rpcInput);

    if (error) {
      console.error('[PATCH /api/tenant/estimates/[id]/convert-to-invoice]', error);
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('forbidden') || msg.includes('not_allowed')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (msg.includes('invalid_status') || msg.includes('already_') || msg.includes('invalid_line')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error.message ?? 'Convert failed' }, { status: 500 });
    }

    const invoiceId = (data as Record<string, unknown>)?.invoice_id as string | undefined;
    const addedLines = parsed.data.added_lines;
    if (invoiceId && addedLines && addedLines.length > 0) {
      const now = new Date().toISOString();
      const rows = addedLines.map((al) => {
        const taxable = al.qty * al.unit_price * (1 - al.disc_pct / 100);
        const lineTotal = taxable + taxable * (al.tax_pct / 100);
        return {
          invoice_id: invoiceId,
          tenant_product_id: al.tenant_product_id,
          qty: al.qty,
          unit_price: al.unit_price,
          disc_pct: al.disc_pct,
          tax_rate: al.tax_pct,
          tax_pct: al.tax_pct,
          line_total: lineTotal,
          created_at: now,
          updated_at: now,
          created_by: claims.sub,
          updated_by: claims.sub,
        };
      });
      const { error: insertErr } = await db.schema('app').from('invoice_items').insert(rows);
      if (insertErr) {
        console.error('[PATCH /api/tenant/estimates/[id]/convert-to-invoice] added_lines insert', insertErr);
        return NextResponse.json({ error: 'Failed to add new products to invoice' }, { status: 500 });
      }
    }

    return NextResponse.json({ data: (data ?? {}) as Record<string, unknown> });
  } catch (e) {
    console.error('[PATCH /api/tenant/estimates/[id]/convert-to-invoice]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
