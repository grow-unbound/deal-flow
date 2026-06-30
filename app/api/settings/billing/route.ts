import { NextRequest, NextResponse } from 'next/server';

import { assertTenantClaim, AuthorizationError, getVerifiedClaims } from '@/lib/auth';
import { buildBillingView } from '@/lib/billing/build-billing-view';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
    const tenantId = claims.tenant_id;

    const [
      { data: tenantRow, error: tenantErr },
      { count: cohortCount, error: cohortErr },
      { count: priceListCount, error: plErr },
      { count: catalogCount, error: catErr },
    ] = await Promise.all([
      db
        .schema('app')
        .from('tenants')
        .select('plan, whatsapp_credits_balance, whatsapp_credits_purchased')
        .eq('id', tenantId)
        .maybeSingle(),
      db
        .schema('app')
        .from('cohorts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      db
        .schema('app')
        .from('price_lists')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      db
        .schema('app')
        .from('campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'published')
        .is('deleted_at', null),
    ]);

    if (tenantErr || !tenantRow || cohortErr || plErr || catErr) {
      console.error('[GET /api/settings/billing]', tenantErr, cohortErr, plErr, catErr);
      return NextResponse.json(
        { data: null, error: { code: 'LOAD_FAILED', message: 'Failed to load billing' } },
        { status: 500 },
      );
    }

    const view = buildBillingView({
      plan: (tenantRow.plan as string) ?? 'starter',
      usage: {
        cohorts: cohortCount ?? 0,
        price_lists: priceListCount ?? 0,
        catalogs: catalogCount ?? 0,
      },
      whatsappBalance: Number(tenantRow.whatsapp_credits_balance ?? 1000),
      whatsappPurchased: Number(tenantRow.whatsapp_credits_purchased ?? 1000),
    });

    return NextResponse.json({ data: view, error: null }, { status: 200 });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: e.message } }, { status: 403 });
    }
    return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }
}
