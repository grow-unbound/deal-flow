import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { effectiveInvoiceStatus } from '@/lib/invoice-status';
import { canAccessDocumentLocation } from '@/lib/server/seller-location-access';
import { sendInvoiceReminderWhatsApp } from '@/lib/server/whatsapp-document-send';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  buyer_id: z.string().uuid(),
  entry_ids: z.array(z.string().uuid()).min(1).max(100),
  note: z.string().trim().max(2000).optional(),
});

async function assertInvoiceFlags(tenantId: string): Promise<boolean> {
  const om = await getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, tenantId);
  const inv = await getFlag(FEATURE_FLAGS.INVOICES, tenantId);
  return om && inv;
}

type EntryRow = {
  id: string;
  tenant_id: string;
  buyer_id: string | null;
  location_id: string | null;
  entry_type: string;
  status: string;
  source_entity_type: string;
  source_entity_id: string;
  metadata: Record<string, unknown>;
};

type InvoiceRow = {
  id: string;
  tenant_id: string;
  buyer_id: string | null;
  status: string | null;
  due_date: string | null;
  invoice_number: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!(await assertInvoiceFlags(claims.tenant_id))) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }
    if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }

    const entryIds = Array.from(new Set(parsed.data.entry_ids));
    const db = supabaseAdmin;

    const { data: entriesData, error: entriesError } = await db
      .schema('app')
      .from('entries')
      .select('id, tenant_id, buyer_id, location_id, entry_type, status, source_entity_type, source_entity_id, metadata')
      .in('id', entryIds)
      .is('deleted_at', null);

    if (entriesError) {
      console.error('[POST collection remind] entries lookup failed', entriesError);
      return NextResponse.json({ error: 'Failed to load entries' }, { status: 500 });
    }

    const entries = (entriesData ?? []) as EntryRow[];
    if (entries.length !== entryIds.length) {
      return NextResponse.json({ error: 'One or more entries were not found' }, { status: 404 });
    }

    for (const entry of entries) {
      if (entry.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (entry.buyer_id !== parsed.data.buyer_id) return NextResponse.json({ error: 'Entry does not belong to this buyer' }, { status: 400 });
      if (entry.location_id && !canAccessDocumentLocation(claims, entry.location_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (entry.source_entity_type !== 'invoice' || !['invoice_due', 'invoice_overdue'].includes(entry.entry_type)) {
        return NextResponse.json({ error: 'Only due or overdue invoice entries can be reminded together' }, { status: 400 });
      }
      if (entry.status === 'resolved' || entry.status === 'waiting') {
        return NextResponse.json({ error: 'One or more entries are not active' }, { status: 400 });
      }
    }

    const invoiceIds = entries.map((entry) => entry.source_entity_id);
    const { data: invoicesData, error: invoicesError } = await db
      .schema('app')
      .from('invoices')
      .select('id, tenant_id, buyer_id, status, due_date, invoice_number')
      .in('id', invoiceIds)
      .is('deleted_at', null);

    if (invoicesError) {
      console.error('[POST collection remind] invoices lookup failed', invoicesError);
      return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
    }

    const invoices = (invoicesData ?? []) as InvoiceRow[];
    if (invoices.length !== invoiceIds.length) {
      return NextResponse.json({ error: 'One or more invoices were not found' }, { status: 404 });
    }

    for (const invoice of invoices) {
      if (invoice.tenant_id !== claims.tenant_id || invoice.buyer_id !== parsed.data.buyer_id) {
        return NextResponse.json({ error: 'Invoice does not belong to this buyer' }, { status: 400 });
      }
      const status = String(invoice.status ?? '');
      const effective = effectiveInvoiceStatus({ status, due_date: invoice.due_date });
      if (status === 'void' || status === 'paid' || status === 'draft' || (effective !== 'sent' && effective !== 'overdue')) {
        return NextResponse.json({ error: 'Reminder not allowed for one or more invoices' }, { status: 400 });
      }
    }

    const sendResult = await sendInvoiceReminderWhatsApp(db, {
      tenantId: claims.tenant_id,
      buyerId: parsed.data.buyer_id,
      invoiceId: invoiceIds[0],
    });
    if (!sendResult.ok) {
      return NextResponse.json(
        { error: sendResult.state.block_message ?? 'Failed to send reminder', code: sendResult.state.block_reason },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const { error: invoiceUpdateError } = await db
      .schema('app')
      .from('invoices')
      .update({ last_reminder_at: now, updated_at: now })
      .in('id', invoiceIds)
      .eq('tenant_id', claims.tenant_id);

    if (invoiceUpdateError) {
      console.error('[POST collection remind] invoice update failed', invoiceUpdateError);
      return NextResponse.json({ error: 'Failed to record reminder' }, { status: 500 });
    }

    const metadata = { last_reminder_at: now, batch_entry_ids: entryIds };
    for (const entry of entries) {
      const { error: entryUpdateError } = await db
        .schema('app')
        .from('entries')
        .update({
          status: 'in_progress',
          remind_at: null,
          last_actor_id: claims.sub,
          last_action: 'send_reminder',
          last_action_at: now,
          metadata: { ...(entry.metadata ?? {}), ...metadata },
          updated_by: claims.sub,
        })
        .eq('id', entry.id)
        .eq('tenant_id', claims.tenant_id);

      if (entryUpdateError) {
        console.error('[POST collection remind] entry update failed', entryUpdateError);
        return NextResponse.json({ error: 'Failed to record reminder' }, { status: 500 });
      }
    }

    const previousStatus = new Map(entries.map((entry) => [entry.id, entry.status]));
    const { error: eventsError } = await db.schema('app').from('entry_events').insert(entryIds.map((entryId) => ({
      tenant_id: claims.tenant_id,
      entry_id: entryId,
      actor_user_id: claims.sub,
      action: 'send_reminder',
      from_status: previousStatus.get(entryId) ?? null,
      to_status: 'in_progress',
      note: parsed.data.note ?? null,
      metadata,
      created_by: claims.sub,
      updated_by: claims.sub,
    })));

    if (eventsError) {
      console.error('[POST collection remind] event insert failed', eventsError);
      return NextResponse.json({ error: 'Failed to record reminder history' }, { status: 500 });
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'buyer',
      entity_id: parsed.data.buyer_id,
      action: 'invoice_reminder_batch',
      diff: {
        template_name: 'buyer_payment_reminder',
        recipient: sendResult.recipientPhone,
        invoice_ids: invoiceIds,
        invoice_numbers: invoices.map((invoice) => invoice.invoice_number).filter(Boolean),
      },
      ts: now,
    });

    return NextResponse.json({
      data: {
        entry_ids: entryIds,
        last_reminder_at: now,
        recipient_phone: sendResult.recipientPhone,
        message: 'Reminder sent',
      },
    });
  } catch (error) {
    console.error('[POST collection remind]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
