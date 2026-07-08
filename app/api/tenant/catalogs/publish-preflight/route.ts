import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import {
  buildCampaignPublishPreview,
  buildComposerScopeValueForPreview,
  campaignScopeToBroadcastTarget,
} from '@/lib/server/campaign-publish-preview';
import { CatalogComposerPriceSourceSchema } from '@/lib/zod';

const ComposerPublishPreflightSchema = z.object({
  notify_whatsapp: z.boolean().optional().default(false),
  scope_type: z.enum(['cohort', 'buyer', 'all']),
  cohort_id: z.string().uuid().nullable().optional(),
  buyer_ids: z.array(z.string().uuid()).default([]),
  name: z.string().min(1),
  valid_from: z.string(),
  valid_to: z.string().nullable().optional(),
  products_count: z.number().int().nonnegative(),
  price_source: CatalogComposerPriceSourceSchema,
  price_list_name: z.string().nullable().optional(),
  hero_image_url: z.string().url().nullable().optional(),
  campaign_id: z.string().uuid().optional(),
  buyer_note: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const parsed = ComposerPublishPreflightSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;
  const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const scopeValue = buildComposerScopeValueForPreview({
    scopeType: input.scope_type,
    cohortId: input.cohort_id,
    buyerIds: input.buyer_ids,
  });

  let cohortName: string | null = null;
  let memberCount: number | null = null;

  if (input.scope_type === 'cohort' && input.cohort_id) {
    const { data: cohort } = await db
      .schema('app')
      .from('cohorts')
      .select('name')
      .eq('id', input.cohort_id)
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();
    cohortName = cohort?.name ?? null;

    const target = campaignScopeToBroadcastTarget({ scopeType: 'cohort', scopeValue });
    const { data: audienceRows } = await db.schema('app').rpc(
      'resolve_broadcast_audience_cohort',
      { p_tenant_id: claims.tenant_id, p_cohort_id: target.targetCohortId },
    );
    memberCount = Array.isArray(audienceRows) ? audienceRows.length : null;
  } else if (input.scope_type === 'buyer') {
    memberCount = input.buyer_ids.length;
  } else if (input.scope_type === 'all') {
    const { data: audienceRows } = await db.schema('app').rpc(
      'resolve_broadcast_audience_all',
      { p_tenant_id: claims.tenant_id },
    );
    memberCount = Array.isArray(audienceRows) ? audienceRows.length : null;
  }

  const preview = await buildCampaignPublishPreview(db, {
    tenantId: claims.tenant_id,
    notifyWhatsapp: input.notify_whatsapp,
    whatsappFeatureEnabled: flagEnabled,
    cohortName,
    memberCount,
    campaign: {
      id: input.campaign_id ?? null,
      name: input.name,
      valid_from: input.valid_from,
      valid_to: input.valid_to ?? null,
      scope_type: input.scope_type,
      scope_value: scopeValue,
      products_count: input.products_count,
      pricing_scheme: input.price_source === 'price_list'
        ? `Price list — ${input.price_list_name ?? 'Assigned list'}`
        : 'Manual campaign prices',
      buyer_note: input.buyer_note ?? '',
      hero_image_url: input.hero_image_url ?? null,
    },
  });

  return NextResponse.json(preview, { headers: SELLER_CACHE_PERSONAL });
}
