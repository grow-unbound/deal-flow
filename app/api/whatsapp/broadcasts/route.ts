import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { WhatsAppBroadcastCreateSchema } from '@/lib/zod';
import { resolveBroadcastAudience } from '@/lib/server/whatsapp-broadcast-audience';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';

/**
 * WhatsApp Broadcast Phase E — broadcast job list + create.
 *
 * Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.2, §8, §9.
 *
 * GET  — lightweight broadcast history (last ~20 rows) for the Customers page
 *        secondary tab. Both seller_admin and seller_assistant can read.
 * POST — create a broadcast row. seller_admin only (§8), re-verified here at
 *        the API layer in addition to the RLS INSERT policy (belt+suspenders,
 *        same pattern as app/api/customers/import/route.ts).
 *
 * IMPORTANT — Phase F is NOT built yet: this route only resolves the
 * audience, stores estimated_recipient_count, and creates the row at
 * status='scheduled' (or 'draft' if no scheduled_for is given). It never
 * dispatches a real Meta message and never sets status='completed' or
 * 'sending' — those transitions belong to Phase F's pacing worker.
 */
export async function GET(request: NextRequest) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: rows, error } = await db
    .schema('app')
    .from('whatsapp_broadcasts')
    .select(
      'id, name, use_case, target_type, status, scheduled_for, estimated_recipient_count, actual_recipient_count, created_at',
    )
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[GET /api/whatsapp/broadcasts] DB error:', error.code, error.message);
    return NextResponse.json({ error: 'Failed to fetch broadcasts' }, { status: 500 });
  }

  return NextResponse.json({ broadcasts: rows ?? [] }, { headers: SELLER_CACHE_PERSONAL });
}

export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin-only send/create (spec §8) — checked here at the API layer in
  // addition to the RLS INSERT policy on app.whatsapp_broadcasts.
  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden: seller_admin only' }, { status: 403 });
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

  const parsed = WhatsAppBroadcastCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Validate the template exists, is platform-managed, and pull its
  // meta_category (needed for the daily-cap snapshot / future Phase F
  // pre-flight, and for an honest estimated_recipient_count message).
  const { data: template, error: templateError } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id, meta_category, approval_status')
    .eq('id', input.whatsapp_template_id)
    .or(`tenant_id.is.null,tenant_id.eq.${claims.tenant_id}`)
    .is('deleted_at', null)
    .maybeSingle();

  if (templateError || !template) {
    return NextResponse.json({ error: 'Invalid or inaccessible template' }, { status: 400 });
  }

  try {
    const eligibleBuyerIds = await resolveBroadcastAudience(db, {
      tenantId: claims.tenant_id,
      targetType: input.target_type,
      targetCohortId: input.target_cohort_id,
      targetFilter: input.target_filter,
      targetBuyerIds: input.target_buyer_ids,
    });

    // Snapshot the tenant's current daily cap for audit (§4.2
    // daily_cap_at_creation) — app.tenant_broadcast_limits doesn't exist yet
    // (Phase F), so this stays NULL until that table lands; recording NULL
    // rather than a guessed default keeps the column honest.
    const { data: broadcast, error: insertError } = await db
      .schema('app')
      .from('whatsapp_broadcasts')
      .insert({
        tenant_id: claims.tenant_id,
        name: input.name,
        whatsapp_template_id: input.whatsapp_template_id,
        use_case: input.use_case,
        target_type: input.target_type,
        target_cohort_id: input.target_cohort_id ?? null,
        target_filter: input.target_filter ?? null,
        target_buyer_ids: input.target_buyer_ids ?? null,
        linked_campaign_id: input.linked_campaign_id ?? null,
        variable_bindings: input.variable_bindings ?? {},
        // Never 'sending'/'completed' here — Phase F's pacing worker owns
        // those transitions. 'scheduled' if a future send time was given,
        // else 'draft' so nothing implies a send has happened.
        status: input.scheduled_for ? 'scheduled' : 'draft',
        scheduled_for: input.scheduled_for ?? null,
        estimated_recipient_count: eligibleBuyerIds.length,
        daily_cap_at_creation: null,
        created_by: claims.sub,
        updated_by: claims.sub,
      })
      .select('id, name, status, estimated_recipient_count, scheduled_for, created_at')
      .single();

    if (insertError) {
      console.error('[POST /api/whatsapp/broadcasts] insert error:', insertError.code, insertError.message);
      return NextResponse.json({ error: 'Failed to create broadcast' }, { status: 500 });
    }

    return NextResponse.json(
      {
        broadcast,
        recipient_count: eligibleBuyerIds.length,
        note: 'Broadcast saved. Actual sending happens in a later release — this creates the audience and schedule only.',
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[POST /api/whatsapp/broadcasts] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create broadcast' },
      { status: 500 },
    );
  }
}
