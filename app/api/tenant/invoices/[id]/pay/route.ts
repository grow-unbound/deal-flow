import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { effectiveInvoiceStatus } from '@/lib/invoice-status';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const PayBodySchema = z.object({
  amount: z.number().positive(),
  payment_method: z.string().trim().min(1).max(80),
  payment_reference: z.string().trim().max(200).optional().nullable(),
  paid_at: z.string().datetime().optional(),
});

async function assertInvoiceFlags(tenantId: string): Promise<boolean> {
  const om = await getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, tenantId);
  const inv = await getFlag(FEATURE_FLAGS.INVOICES, tenantId);
  return om && inv;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!(await assertInvoiceFlags(claims.tenant_id))) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }
    if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = PayBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 });
    }

    const db = supabaseAdmin;
    const { data: inv, error: invErr } = await db
      .schema('app')
      .from('invoices')
      .select('id, tenant_id, status, due_date, total_amount, outstanding_balance, amount_paid, paid_at')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (invErr || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (inv.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const dbStatus = String(inv.status ?? 'draft');
    if (dbStatus === 'void' || dbStatus === 'paid' || dbStatus === 'draft') {
      return NextResponse.json({ error: 'Invoice cannot be paid in this state' }, { status: 400 });
    }

    const eff = effectiveInvoiceStatus({ status: dbStatus, due_date: (inv.due_date as string | null) ?? null });
    if (eff !== 'sent' && eff !== 'overdue') {
      return NextResponse.json({ error: 'Invoice cannot be paid in this state' }, { status: 400 });
    }

    const total = Number(inv.total_amount ?? 0);
    const outstanding = Number(inv.outstanding_balance ?? 0);
    const paidSoFar = Number(inv.amount_paid ?? 0);
    const payAmount = parsed.data.amount;

    if (payAmount > outstanding + 0.01) {
      return NextResponse.json({ error: 'Amount exceeds outstanding balance' }, { status: 400 });
    }

    const nextPaid = paidSoFar + payAmount;
    let nextOutstanding = Math.max(total - nextPaid, 0);
    if (nextOutstanding < 0.005) nextOutstanding = 0;

    const paidAtIso = parsed.data.paid_at ?? new Date().toISOString();

    let nextStatus: string;
    if (nextOutstanding <= 0) {
      nextStatus = 'paid';
    } else {
      nextStatus = effectiveInvoiceStatus({ status: 'sent', due_date: (inv.due_date as string | null) ?? null }) === 'overdue'
        ? 'overdue'
        : 'sent';
    }

    const patch: Record<string, unknown> = {
      amount_paid: nextPaid,
      outstanding_balance: nextOutstanding,
      payment_method: parsed.data.payment_method,
      payment_reference: parsed.data.payment_reference?.trim() || null,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (nextStatus === 'paid') {
      patch.paid_at = paidAtIso;
    }

    const { error: upErr } = await db.schema('app').from('invoices').update(patch).eq('id', id).eq('tenant_id', claims.tenant_id);
    if (upErr) {
      console.error('[PATCH invoice pay]', upErr);
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'invoice',
      entity_id: id,
      action: 'invoice_payment',
      diff: { amount: payAmount, method: parsed.data.payment_method, reference: parsed.data.payment_reference },
      ts: new Date().toISOString(),
    });

    return NextResponse.json({ data: { id, amount_paid: nextPaid, outstanding_balance: nextOutstanding, status: nextStatus } });
  } catch (e) {
    console.error('[PATCH invoice pay]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
