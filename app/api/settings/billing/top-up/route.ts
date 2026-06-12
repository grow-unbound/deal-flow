import { NextRequest, NextResponse } from 'next/server';

import { assertTenantClaim, AuthorizationError, getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Login required' } }, { status: 401 });
    }
    if (claims.role !== 'seller_admin') {
      return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin only' } }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json(
        { data: null, error: { code: 'SERVER_ERROR', message: 'Server configuration error' } },
        { status: 500 },
      );
    }

    assertTenantClaim(claims);

    const db = supabaseAdmin as any;
    const nowIso = new Date().toISOString();
    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'billing_whatsapp_topup',
      entity_id: claims.tenant_id,
      action: 'create',
      diff: { requested: true, stub: true },
      ts: nowIso,
    });

    return NextResponse.json(
      {
        data: null,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Self-serve credit top-up is not available yet. Contact yukti support to add credits.',
        },
      },
      { status: 501 },
    );
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: e.message } }, { status: 403 });
    }
    return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }
}
