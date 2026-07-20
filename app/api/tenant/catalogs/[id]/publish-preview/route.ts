import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { campaignScopeToBroadcastTarget } from '@/lib/server/campaign-broadcast';
import { buildCampaignPublishPreview } from '@/lib/server/campaign-publish-preview';
import {
  resolveCampaignNotifyRecipientSegments,
  selectCampaignNotifyRecipientBuyerIds,
} from '@/lib/server/campaign-publish-notify';
import { resolveCampaignWorkflowStatus } from '@/lib/campaign-workflow-status';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  const notifyWhatsapp = request.nextUrl.searchParams.get('notify_whatsapp') === 'true';
  const mode = request.nextUrl.searchParams.get('mode') === 'notify_buyers' ? 'notify_buyers' : 'first_publish';

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: campaign, error } = await db
    .schema('app')
    .from('campaigns')
    .select('id, name, status, scope_type, scope_value, valid_from, valid_to, message, hero_image_url, share_token')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Failed to load campaign' }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  const scopeValue = (campaign.scope_value ?? {}) as Record<string, unknown>;
  const workflowStatus = resolveCampaignWorkflowStatus({
    rawStatus: campaign.status,
    validFrom: campaign.valid_from,
    validTo: campaign.valid_to,
    hasUnpublishedChanges: Boolean((scopeValue.composer_draft ?? null) && typeof scopeValue.composer_draft === 'object'),
  });

  if (mode === 'first_publish' && campaign.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft campaigns have a publish preview' }, { status: 400 });
  }
  if (mode === 'notify_buyers' && workflowStatus.value !== 'published') {
    return NextResponse.json({ error: 'Only live published campaigns can notify buyers' }, { status: 400 });
  }

  const composer = (scopeValue.composer ?? {}) as Record<string, unknown>;
  const priceSource = composer.price_source === 'price_list' ? 'price_list' : 'manual';
  const priceListId = typeof composer.price_list_id === 'string' ? composer.price_list_id : null;

  const [{ count: productCount }, { data: priceList }] = await Promise.all([
    db
      .schema('app')
      .from('campaign_items')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .is('deleted_at', null),
    priceSource === 'price_list' && priceListId
      ? db
          .schema('app')
          .from('price_lists')
          .select('name')
          .eq('id', priceListId)
          .eq('tenant_id', claims.tenant_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let cohortName: string | null = null;
  let memberCount: number | null = null;
  if (campaign.scope_type === 'cohort' && typeof scopeValue.cohort_id === 'string') {
    const { data: cohort } = await db
      .schema('app')
      .from('cohorts')
      .select('name')
      .eq('id', scopeValue.cohort_id)
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();
    cohortName = cohort?.name ?? null;

    const target = campaignScopeToBroadcastTarget({
      scopeType: campaign.scope_type,
      scopeValue,
    });
    const { data: audienceRows } = await db.schema('app').rpc(
      'resolve_broadcast_audience_cohort',
      { p_tenant_id: claims.tenant_id, p_cohort_id: target.targetCohortId },
    );
    memberCount = Array.isArray(audienceRows) ? audienceRows.length : null;
  }

  const recipientSegments = mode === 'notify_buyers'
    ? await resolveCampaignNotifyRecipientSegments(db, {
        tenantId: claims.tenant_id,
        campaignId: campaign.id,
        scopeType: campaign.scope_type,
        scopeValue,
      })
    : null;

  const preview = await buildCampaignPublishPreview(db, {
    tenantId: claims.tenant_id,
    notifyWhatsapp,
    whatsappFeatureEnabled: flagEnabled,
    cohortName,
    memberCount,
    recipientBuyerIds: recipientSegments
      ? selectCampaignNotifyRecipientBuyerIds(recipientSegments, 'all_eligible')
      : undefined,
    recipientSegments: recipientSegments
      ? {
          all_eligible: recipientSegments.allEligibleBuyerIds.length,
          not_viewed: recipientSegments.notViewedBuyerIds.length,
          viewed_not_ordered: recipientSegments.viewedNotOrderedBuyerIds.length,
        }
      : undefined,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      valid_from: campaign.valid_from,
      valid_to: campaign.valid_to,
      scope_type: campaign.scope_type,
      scope_value: scopeValue,
      products_count: productCount ?? 0,
      pricing_scheme: priceSource === 'price_list'
        ? `Price list — ${priceList?.name ?? 'Assigned list'}`
        : 'Manual campaign prices',
      buyer_note: campaign.message ?? '',
      hero_image_url: campaign.hero_image_url,
    },
  });

  return NextResponse.json(preview, { headers: SELLER_CACHE_PERSONAL });
}
