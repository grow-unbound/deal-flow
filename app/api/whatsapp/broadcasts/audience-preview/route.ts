import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { WhatsAppBroadcastAudiencePreviewSchema } from '@/lib/zod';
import { resolveBroadcastAudience } from '@/lib/server/whatsapp-broadcast-audience';

/**
 * WhatsApp Broadcast Phase E — audience + cost preview.
 *
 * Composer step (spec §9): "preview audience count + estimated credit cost
 * + opted-out exclusion count" before a seller commits to creating the
 * broadcast row. Read-only — does not create or mutate anything.
 */
export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = WhatsAppBroadcastAudiencePreviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  try {
    const eligibleBuyerIds = await resolveBroadcastAudience(db, {
      tenantId: claims.tenant_id,
      targetType: input.target_type,
      targetCohortId: input.target_cohort_id,
      targetFilter: input.target_filter,
      targetBuyerIds: input.target_buyer_ids,
    });

    // Opted-out exclusion count — how many of the *candidate* set (before the
    // opt-out filter baked into the RPC) were excluded, so the seller sees
    // "12 of your 40 selected buyers are opted out" per spec §7.2. For manual
    // selection this is exact; for other modes we approximate by comparing
    // against the same targeting query without the opt-out filter would
    // require a second RPC variant, so for buyer_selection (the only mode
    // where "selected buyers" has a concrete pre-filter set) we compute it
    // directly; other modes report 0 extra (the eligible count already nets
    // out opt-outs, which is the number that matters for cost).
    let optedOutExcluded = 0;
    if (input.target_type === 'buyer_selection' && input.target_buyer_ids?.length) {
      const { count } = await db
        .schema('app')
        .from('buyers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', claims.tenant_id)
        .in('id', input.target_buyer_ids)
        .is('deleted_at', null)
        .not('whatsapp_opt_out_at', 'is', null);
      optedOutExcluded = count ?? 0;
    }

    const recipientCount = eligibleBuyerIds.length;

    let creditsPerMessage = 1;
    let creditPriceInr = 0.25;
    if (input.meta_category) {
      const { data: rateRow } = await db
        .schema('app')
        .from('whatsapp_rate_card')
        .select('credits_per_message')
        .eq('meta_category', input.meta_category)
        .is('deleted_at', null)
        .maybeSingle();
      if (rateRow?.credits_per_message) creditsPerMessage = Number(rateRow.credits_per_message);

      const { data: pricingRow } = await db
        .schema('app')
        .from('whatsapp_credit_pricing')
        .select('credit_price_inr')
        .is('deleted_at', null)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pricingRow?.credit_price_inr) creditPriceInr = Number(pricingRow.credit_price_inr);
    }

    const estimatedCredits = recipientCount * creditsPerMessage;
    const estimatedInr = Math.round(estimatedCredits * creditPriceInr * 100) / 100;

    return NextResponse.json({
      recipient_count: recipientCount,
      opted_out_excluded: optedOutExcluded,
      credits_per_message: creditsPerMessage,
      estimated_credits: estimatedCredits,
      estimated_inr: estimatedInr,
    });
  } catch (error) {
    console.error('[POST /api/whatsapp/broadcasts/audience-preview] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve audience' },
      { status: 500 },
    );
  }
}
