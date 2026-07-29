import { NextRequest, NextResponse } from 'next/server';

import { assertTenantClaim, AuthorizationError, getVerifiedClaims } from '@/lib/auth';
import { normalizePlanTier } from '@/lib/billing/build-billing-view';
import { supabaseAdmin } from '@/lib/supabase';
import type { PlanTier } from '@/constants/tier-limits';
import { UpgradeRequestSchema } from '@/types/billing-settings';

export const dynamic = 'force-dynamic';

const TIER_RANK: Record<PlanTier, number> = { lite: 0, starter: 1, growth: 2, scale: 3 };

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ data: null, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 });
    }

    const parsed = UpgradeRequestSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid body';
      return NextResponse.json({ data: null, error: { code: 'VALIDATION', message: msg } }, { status: 400 });
    }

    const db = supabaseAdmin as any;
    const { data: tenantRow, error: tErr } = await db
      .schema('app')
      .from('tenants')
      .select('plan')
      .eq('id', claims.tenant_id)
      .maybeSingle();

    if (tErr || !tenantRow) {
      return NextResponse.json({ data: null, error: { code: 'LOAD_FAILED', message: 'Tenant not found' } }, { status: 500 });
    }

    const current = normalizePlanTier((tenantRow.plan as string) ?? 'starter');
    const target = parsed.data.target_tier;
    if (TIER_RANK[target] <= TIER_RANK[current]) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION', message: 'Target tier must be higher than your current plan.' } },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    const { error: auditError } = await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'billing_upgrade_request',
      entity_id: claims.tenant_id,
      action: 'create',
      diff: {
        target_tier: target,
        current_tier: current,
        contact_name: parsed.data.contact_name,
        contact_phone: parsed.data.contact_phone,
        note: parsed.data.note ?? null,
      },
      ts: nowIso,
    });
    if (auditError) {
      console.error('[POST /api/settings/billing/upgrade-request] audit', auditError);
      return NextResponse.json({ data: null, error: { code: 'AUDIT_FAILED', message: 'Failed to record request' } }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true }, error: null }, { status: 200 });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: e.message } }, { status: 403 });
    }
    return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }
}
