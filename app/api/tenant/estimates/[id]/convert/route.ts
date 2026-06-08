import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';

const ConvertBodySchema = z.object({
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  line_ids: z.array(z.string().uuid()).min(1),
  order_number: z.string().min(1).max(64).optional(),
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

    const parsed = ConvertBodySchema.safeParse(body);
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
      .select('id, tenant_id, status, converted_to_order_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (estimateError || !estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }
    if (estimate.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await db.schema('app').rpc('estimate_convert_to_order', {
      p_tenant_id: claims.tenant_id,
      p_estimate_id: id,
      p_actor_user_id: claims.sub,
      p_line_ids: parsed.data.line_ids,
      p_expected_delivery: parsed.data.delivery_date,
      p_order_number_override: parsed.data.order_number ?? null,
    });

    if (error) {
      console.error('[PATCH /api/tenant/estimates/[id]/convert]', error);
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('forbidden') || msg.includes('not_allowed')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (msg.includes('invalid_status') || msg.includes('already_') || msg.includes('invalid_line')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error.message ?? 'Convert failed' }, { status: 500 });
    }

    return NextResponse.json({ data: (data ?? {}) as Record<string, unknown> });
  } catch (e) {
    console.error('[PATCH /api/tenant/estimates/[id]/convert]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
