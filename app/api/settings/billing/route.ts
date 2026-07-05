import { NextRequest, NextResponse } from 'next/server';

import { assertTenantClaim, AuthorizationError, getVerifiedClaims } from '@/lib/auth';
import { buildBillingView, buildWhatsAppUsageHistory } from '@/lib/billing/build-billing-view';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
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

    // Usage history window: last 30 days of sent/delivered/read messages,
    // grouped by (date, trigger_source, meta_category). Phase E's
    // app.whatsapp_broadcasts table will let this group by broadcast name
    // instead — for now trigger_source/meta_category is the closest we have.
    const historyWindowStart = new Date();
    historyWindowStart.setDate(historyWindowStart.getDate() - 30);

    const [
      { data: tenantRow, error: tenantErr },
      { count: cohortCount, error: cohortErr },
      { count: priceListCount, error: plErr },
      { count: catalogCount, error: catErr },
      { data: pricingRow, error: pricingErr },
      { data: messageRows, error: messagesErr },
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
      db
        .schema('app')
        .from('whatsapp_credit_pricing')
        .select('credit_price_inr')
        .is('deleted_at', null)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .schema('app')
        .from('whatsapp_messages')
        .select('sent_at, created_at, trigger_source, meta_category, credits_charged')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('created_at', historyWindowStart.toISOString())
        .not('credits_charged', 'is', null),
    ]);

    if (tenantErr || !tenantRow || cohortErr || plErr || catErr) {
      console.error('[GET /api/settings/billing]', tenantErr, cohortErr, plErr, catErr);
      return NextResponse.json(
        { data: null, error: { code: 'LOAD_FAILED', message: 'Failed to load billing' } },
        { status: 500 },
      );
    }

    if (pricingErr || messagesErr) {
      console.error('[GET /api/settings/billing] whatsapp usage', pricingErr, messagesErr);
    }

    const usageHistory = buildWhatsAppUsageHistory(messageRows ?? []);

    const view = buildBillingView({
      plan: (tenantRow.plan as string) ?? 'starter',
      usage: {
        cohorts: cohortCount ?? 0,
        price_lists: priceListCount ?? 0,
        catalogs: catalogCount ?? 0,
      },
      whatsappBalance: Number(tenantRow.whatsapp_credits_balance ?? 1000),
      whatsappPurchased: Number(tenantRow.whatsapp_credits_purchased ?? 1000),
      whatsappCreditPriceInr: Number(pricingRow?.credit_price_inr ?? 0.25),
      whatsappUsageHistory: usageHistory,
    });

    return NextResponse.json({ data: view, error: null }, { status: 200, headers: SELLER_CACHE_PERSONAL });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: e.message } }, { status: 403 });
    }
    return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }
}
