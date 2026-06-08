import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS, ROLES } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const VoidBodySchema = z.object({
  confirmed: z.literal(true),
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
    if (claims.role !== ROLES.SELLER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    const parsed = VoidBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 });
    }

    const db = supabaseAdmin;
    const { data: inv, error: invErr } = await db
      .schema('app')
      .from('invoices')
      .select('id, tenant_id, status')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (invErr || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (inv.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const st = String(inv.status ?? '');
    if (st === 'paid' || st === 'void') {
      return NextResponse.json({ error: 'Invoice cannot be voided' }, { status: 400 });
    }
    if (st !== 'draft' && st !== 'sent' && st !== 'overdue') {
      return NextResponse.json({ error: 'Invoice cannot be voided' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: upErr } = await db
      .schema('app')
      .from('invoices')
      .update({
        status: 'void',
        voided_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    if (upErr) {
      console.error('[PATCH invoice void]', upErr);
      return NextResponse.json({ error: 'Failed to void invoice' }, { status: 500 });
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'invoice',
      entity_id: id,
      action: 'invoice_voided',
      diff: {},
      ts: now,
    });

    return NextResponse.json({ data: { id, status: 'void' } });
  } catch (e) {
    console.error('[PATCH invoice void]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
