import { NextRequest, NextResponse } from 'next/server';
import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { effectiveInvoiceStatus } from '@/lib/invoice-status';
import { sendInvoiceReminderWhatsApp } from '@/lib/server/whatsapp-document-send';
import { supabaseAdmin } from '@/lib/supabase';
import { getPostHogClient } from '@/lib/posthog-server';
import { withTenantSellerIds } from '@/lib/analytics-identity-server';

export const dynamic = 'force-dynamic';

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

    const db = supabaseAdmin;
    const { data: inv, error: invErr } = await db
      .schema('app')
      .from('invoices')
      .select('id, tenant_id, buyer_id, status, due_date, invoice_number')
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

    const sendResult = await sendInvoiceReminderWhatsApp(db, {
      tenantId: claims.tenant_id,
      buyerId: (inv.buyer_id as string | null) ?? null,
      invoiceId: id,
    });
    if (!sendResult.ok) {
      return NextResponse.json(
        { error: sendResult.state.block_message ?? 'Failed to send reminder', code: sendResult.state.block_reason },
        { status: 409 },
      );
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
      diff: {
        template_name: 'buyer_payment_reminder',
        recipient: sendResult.recipientPhone,
        invoice_number: inv.invoice_number,
      },
      ts: now,
    });

    getPostHogClient()?.capture({
      distinctId: claims.sub ?? claims.tenant_id,
      event: 'invoice_reminder_sent',
      properties: { ...withTenantSellerIds(claims), invoice_id: id },
    });

    return NextResponse.json({ data: { id, last_reminder_at: now } });
  } catch (e) {
    console.error('[PATCH invoice remind]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
