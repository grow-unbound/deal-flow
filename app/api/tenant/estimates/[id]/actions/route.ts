import { NextRequest, NextResponse } from 'next/server';
import { safeErrorMessage } from '@/lib/server/safe-error-message';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { FEATURE_FLAGS } from '@/constants';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';

type DbClient = NonNullable<typeof supabaseAdmin>;

function currentIstDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
}

const ActionsBodySchema = z.object({
  action: z.enum(['send', 'accept', 'decline', 'convert_order', 'convert_invoice', 'duplicate']),
  invoice_date: z.string().min(4).optional(),
  due_date: z.string().min(4).optional(),
});

export async function POST(
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

    const [orderMgmt, estimatesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
    ]);
    if (!orderMgmt || !estimatesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = ActionsBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    if (parsed.data.action === 'convert_invoice') {
      const invoiceDate = parsed.data.invoice_date ?? parsed.data.due_date;
      if (!invoiceDate) {
        return NextResponse.json({ error: 'invoice_date required for convert_invoice' }, { status: 400 });
      }
      const date = new Date(invoiceDate);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: 'Invalid invoice_date' }, { status: 400 });
      }
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as DbClient as any;
    const tenantId = claims.tenant_id;
    const actor = claims.sub;

    const { data: estProbe } = await db
      .schema('app')
      .from('estimates')
      .select('id, tenant_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!estProbe) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }
    if (estProbe.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rpcName =
      parsed.data.action === 'send'
        ? 'estimate_send'
        : parsed.data.action === 'accept'
          ? 'estimate_accept'
          : parsed.data.action === 'decline'
            ? 'estimate_decline'
            : parsed.data.action === 'convert_order'
              ? 'estimate_convert_to_order'
              : parsed.data.action === 'convert_invoice'
                ? 'estimate_convert_to_invoice'
                : 'estimate_duplicate';

    const rpcArgs: Record<string, unknown> = {
      p_tenant_id: tenantId,
      p_estimate_id: id,
      p_actor_user_id: actor,
    };
    if (parsed.data.action === 'convert_order') {
      rpcArgs.p_order_date = currentIstDate();
    }
    if (parsed.data.action === 'convert_invoice') {
      const invoiceDate = parsed.data.invoice_date ?? parsed.data.due_date;
      if (invoiceDate) {
        rpcArgs.p_invoice_date = invoiceDate.slice(0, 10);
      }
    }

    const { data, error } = await db.schema('app').rpc(rpcName, rpcArgs);

    if (error) {
      console.error(`[POST /api/tenant/estimates/[id]/actions] rpc ${rpcName}`, error);
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('forbidden') || msg.includes('not_allowed')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (msg.includes('invalid_status') || msg.includes('already_')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: safeErrorMessage(error, 'Action failed') }, { status: 500 });
    }

    return NextResponse.json({ data: (data ?? {}) as Record<string, unknown> });
  } catch (e) {
    console.error('[POST /api/tenant/estimates/[id]/actions]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
