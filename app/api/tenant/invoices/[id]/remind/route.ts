import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { effectiveInvoiceStatus } from '@/lib/invoice-status';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const RemindBodySchema = z.object({
  message: z.string().trim().max(2000).optional(),
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

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = RemindBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 });
    }

    const db = supabaseAdmin;
    const { data: inv, error: invErr } = await db
      .schema('app')
      .from('invoices')
      .select('id, tenant_id, status, due_date, invoice_number')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (invErr || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (inv.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const dbStatus = String(inv.status ?? '');
    if (dbStatus === 'void' || dbStatus === 'paid' || dbStatus === 'draft') {
      return NextResponse.json({ error: 'Reminder not allowed for this invoice' }, { status: 400 });
    }
    const eff = effectiveInvoiceStatus({ status: dbStatus, due_date: (inv.due_date as string | null) ?? null });
    if (eff !== 'sent' && eff !== 'overdue') {
      return NextResponse.json({ error: 'Reminder not allowed for this invoice' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: upErr } = await db
      .schema('app')
      .from('invoices')
      .update({ last_reminder_at: now, updated_at: now })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    if (upErr) {
      console.error('[PATCH invoice remind]', upErr);
      return NextResponse.json({ error: 'Failed to record reminder' }, { status: 500 });
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'invoice',
      entity_id: id,
      action: 'invoice_reminder',
      diff: { message: parsed.data.message ?? null, invoice_number: inv.invoice_number },
      ts: now,
    });

    return NextResponse.json({ data: { id, last_reminder_at: now } });
  } catch (e) {
    console.error('[PATCH invoice remind]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
