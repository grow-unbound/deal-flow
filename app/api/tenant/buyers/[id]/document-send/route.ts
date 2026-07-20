import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { getBuyerDocumentSendState } from '@/lib/server/whatsapp-document-send';
import { supabaseAdmin } from '@/lib/supabase';

const QuerySchema = z.object({
  kind: z.enum(['estimate', 'invoice']),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: buyerId } = await params;

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = QuerySchema.safeParse({
      kind: request.nextUrl.searchParams.get('kind'),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
    }

    const { kind } = parsed.data;
    const [orderMgmt, estimatesFlag, invoicesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
      getFlag(FEATURE_FLAGS.INVOICES, claims.tenant_id),
    ]);
    if (!orderMgmt) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }
    if (kind === 'estimate' && !estimatesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }
    if (kind === 'invoice' && !invoicesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as Parameters<typeof getBuyerDocumentSendState>[0];
    const { data: buyer, error: buyerError } = await db
      .schema('app')
      .from('buyers')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('id', buyerId)
      .is('deleted_at', null)
      .maybeSingle();

    if (buyerError || !buyer) {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
    }

    const whatsappSend = await getBuyerDocumentSendState(db, {
      kind,
      tenantId: claims.tenant_id,
      buyerId,
    });

    return NextResponse.json({ data: whatsappSend }, { headers: SELLER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/tenant/buyers/[id]/document-send]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
