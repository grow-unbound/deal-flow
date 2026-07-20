/**
 * Shared WhatsApp queueing for first-publish and follow-up campaign reminders.
 */

import type { CatalogNotifyRecipientFilter } from '@/lib/zod';
import { buildBroadcastMessageQueue } from '@/lib/server/whatsapp-broadcast-send';
import { campaignScopeToBroadcastTarget } from '@/lib/server/campaign-broadcast';
import type { CampaignScopeType } from '@/lib/server/campaign-broadcast';
import { runCampaignPublishPreflight } from '@/lib/server/campaign-publish-preflight';
import { isEligibleCampaignEstimate, isEligibleCampaignOrder } from '@/lib/server/campaign-performance';
import { resolveBroadcastAudience } from '@/lib/server/whatsapp-broadcast-audience';
import { enqueueWhatsAppMessage, triggerWhatsAppDispatch } from '@/lib/server/whatsapp-enqueue';
import { resolveCampaignHeaderImage, uploadHeaderImageToMeta } from '@/lib/server/whatsapp-meta-media';

export interface CampaignPublishNotifyInput {
  tenantId: string;
  actorId: string;
  campaignId: string;
  campaignName: string;
  scopeType: CampaignScopeType;
  scopeValue: Record<string, unknown> | null;
  buyerNote?: string | null;
  scheduledFor?: string | null;
  heroImageUrl?: string | null;
}

export interface CampaignFollowupNotifyInput extends CampaignPublishNotifyInput {
  recipientFilter: CatalogNotifyRecipientFilter;
}

export interface CampaignPublishNotifyResult {
  broadcast_id: string;
  recipient_count: number;
  scheduled: boolean;
}

export interface CampaignNotifyRecipientSegments {
  allEligibleBuyerIds: string[];
  notViewedBuyerIds: string[];
  viewedNotOrderedBuyerIds: string[];
}

export function buildCampaignNotifyRecipientSegments(input: {
  eligibleBuyerIds: string[];
  viewedBuyerIds: Iterable<string>;
  convertingBuyerIds: Iterable<string>;
}): CampaignNotifyRecipientSegments {
  const viewedBuyerIds = new Set(input.viewedBuyerIds);
  const convertingBuyerIds = new Set(input.convertingBuyerIds);
  const allEligibleBuyerIds = Array.from(new Set(input.eligibleBuyerIds));
  const notViewedBuyerIds = allEligibleBuyerIds.filter((buyerId) => !viewedBuyerIds.has(buyerId));
  const viewedNotOrderedBuyerIds = allEligibleBuyerIds.filter(
    (buyerId) => viewedBuyerIds.has(buyerId) && !convertingBuyerIds.has(buyerId),
  );

  return {
    allEligibleBuyerIds,
    notViewedBuyerIds,
    viewedNotOrderedBuyerIds,
  };
}

export async function resolveCampaignNotifyRecipientSegments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: {
    tenantId: string;
    campaignId: string;
    scopeType: CampaignScopeType;
    scopeValue: Record<string, unknown> | null;
  },
): Promise<CampaignNotifyRecipientSegments> {
  const target = campaignScopeToBroadcastTarget({
    scopeType: input.scopeType,
    scopeValue: input.scopeValue,
  });

  const [eligibleBuyerIds, viewsRes, ordersRes, estimatesRes] = await Promise.all([
    resolveBroadcastAudience(db, {
      tenantId: input.tenantId,
      targetType: target.targetType,
      targetCohortId: target.targetCohortId,
      targetFilter: target.targetFilter,
      targetBuyerIds: target.targetBuyerIds,
    }),
    db
      .schema('app')
      .from('campaign_views')
      .select('buyer_id')
      .eq('tenant_id', input.tenantId)
      .eq('campaign_id', input.campaignId)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('orders')
      .select('buyer_id, status')
      .eq('tenant_id', input.tenantId)
      .eq('campaign_id', input.campaignId)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('estimates')
      .select('buyer_id, status, converted_to_order_id')
      .eq('tenant_id', input.tenantId)
      .eq('campaign_id', input.campaignId)
      .is('deleted_at', null),
  ]);

  if (viewsRes.error) {
    throw new Error('Failed to load campaign views for notify audience');
  }
  if (ordersRes.error) {
    throw new Error('Failed to load campaign orders for notify audience');
  }
  if (estimatesRes.error) {
    throw new Error('Failed to load campaign estimates for notify audience');
  }

  const viewedBuyerIds = new Set(
    ((viewsRes.data ?? []) as Array<{ buyer_id: string }>).map((row) => row.buyer_id),
  );

  const convertingBuyerIds = new Set<string>();
  for (const order of (ordersRes.data ?? []) as Array<{ buyer_id: string; status: string }>) {
    if (isEligibleCampaignOrder(order)) convertingBuyerIds.add(order.buyer_id);
  }
  for (const estimate of (estimatesRes.data ?? []) as Array<{
    buyer_id: string;
    status: string;
    converted_to_order_id: string | null;
  }>) {
    if (isEligibleCampaignEstimate(estimate)) convertingBuyerIds.add(estimate.buyer_id);
  }

  return buildCampaignNotifyRecipientSegments({
    eligibleBuyerIds,
    viewedBuyerIds,
    convertingBuyerIds,
  });
}

export function selectCampaignNotifyRecipientBuyerIds(
  segments: CampaignNotifyRecipientSegments,
  recipientFilter: CatalogNotifyRecipientFilter,
): string[] {
  switch (recipientFilter) {
    case 'not_viewed':
      return segments.notViewedBuyerIds;
    case 'viewed_not_ordered':
      return segments.viewedNotOrderedBuyerIds;
    case 'all_eligible':
    default:
      return segments.allEligibleBuyerIds;
  }
}

async function loadAnnouncementTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
) {
  const { data: template, error: templateError } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id, meta_template_name, meta_category, approval_status, use_case, locale, variables, button_config, buttons_config, header_config')
    .eq('use_case', 'campaign_announcement')
    .is('tenant_id', null)
    .is('deleted_at', null)
    .maybeSingle();

  if (templateError || !template) {
    throw new Error('campaign_announcement template not found (use_case)');
  }

  return template;
}

async function createAndQueueCampaignBroadcast(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: CampaignPublishNotifyInput & {
    buyerIds: string[];
    targetType: 'cohort' | 'buyer_selection' | 'geography_filter' | 'all_buyers' | 'dormant_filter' | 'dues_filter';
    targetCohortId?: string | null;
    targetFilter?: Record<string, string | number> | null;
    targetBuyerIds?: string[] | null;
    broadcastName: string;
    duplicateGuard: 'campaign_singleton' | 'none';
  },
): Promise<CampaignPublishNotifyResult> {
  const preflight = await runCampaignPublishPreflight(db, {
    tenantId: input.tenantId,
    scopeType: input.scopeType,
    scopeValue: input.scopeValue,
    notifyWhatsapp: true,
    recipientBuyerIds: input.buyerIds,
  });

  if (!preflight.can_notify) {
    throw new Error(preflight.blockers[0] ?? 'WhatsApp notify preflight failed');
  }

  const template = await loadAnnouncementTemplate(db);

  if (input.duplicateGuard === 'campaign_singleton') {
    const { data: existingBroadcast } = await db
      .schema('app')
      .from('whatsapp_broadcasts')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('linked_campaign_id', input.campaignId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (existingBroadcast?.id) {
      throw new Error('A WhatsApp broadcast already exists for this campaign');
    }
  }

  const resolvedHeader = await resolveCampaignHeaderImage(db, {
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    heroImageUrl: input.heroImageUrl,
  });

  let metaHeaderMediaId: string | null = null;
  try {
    metaHeaderMediaId = await uploadHeaderImageToMeta(resolvedHeader.imageUrl);
  } catch (err) {
    console.warn('[campaign-publish-notify] Meta header upload failed, will use link fallback', err);
  }

  const { data: broadcast, error: insertError } = await db
    .schema('app')
    .from('whatsapp_broadcasts')
    .insert({
      tenant_id: input.tenantId,
      name: input.broadcastName,
      whatsapp_template_id: template.id,
      use_case: 'campaign_announcement',
      target_type: input.targetType,
      target_cohort_id: input.targetCohortId ?? null,
      target_filter: input.targetFilter ?? null,
      target_buyer_ids: input.targetBuyerIds ?? null,
      linked_campaign_id: input.campaignId,
      variable_bindings: {
        buyer_note: input.buyerNote?.trim() || 'Check out our latest offers.',
      },
      status: input.scheduledFor ? 'scheduled' : 'sending',
      scheduled_for: input.scheduledFor ?? null,
      estimated_recipient_count: input.buyerIds.length,
      actual_recipient_count: 0,
      meta_header_media_id: metaHeaderMediaId,
      header_image_source: resolvedHeader.source,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select('id')
    .single();

  if (insertError || !broadcast?.id) {
    throw new Error('Failed to create campaign publish broadcast');
  }

  const queueInputs = await buildBroadcastMessageQueue(db, {
    tenantId: input.tenantId,
    whatsappBroadcastId: broadcast.id as string,
    buyerIds: input.buyerIds,
    template,
    variableBindings: {
      buyer_note: input.buyerNote?.trim() || 'Check out our latest offers.',
    },
    linkedCampaignId: input.campaignId,
    scheduledSendAt: input.scheduledFor ?? null,
    headerMediaId: metaHeaderMediaId,
    headerImageLink: metaHeaderMediaId ? null : resolvedHeader.imageUrl,
  });

  const messageIds: string[] = [];
  for (const queueInput of queueInputs) {
    const result = await enqueueWhatsAppMessage(queueInput);
    if (!result.enqueued) {
      throw new Error('Failed to enqueue one or more campaign publish messages');
    }
    if (result.messageId) messageIds.push(result.messageId);
  }

  await db
    .schema('app')
    .from('whatsapp_broadcasts')
    .update({
      actual_recipient_count: queueInputs.length,
      estimated_recipient_count: queueInputs.length,
      updated_by: input.actorId,
    })
    .eq('id', broadcast.id);

  if (!input.scheduledFor) {
    await triggerWhatsAppDispatch(messageIds);
  }

  return {
    broadcast_id: broadcast.id as string,
    recipient_count: queueInputs.length,
    scheduled: Boolean(input.scheduledFor),
  };
}

export async function queueCampaignPublishNotify(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: CampaignPublishNotifyInput,
): Promise<CampaignPublishNotifyResult> {
  const target = campaignScopeToBroadcastTarget({
    scopeType: input.scopeType,
    scopeValue: input.scopeValue,
  });
  const buyerIds = await resolveBroadcastAudience(db, {
    tenantId: input.tenantId,
    targetType: target.targetType,
    targetCohortId: target.targetCohortId,
    targetFilter: target.targetFilter,
    targetBuyerIds: target.targetBuyerIds,
  });

  return createAndQueueCampaignBroadcast(db, {
    ...input,
    buyerIds,
    targetType: target.targetType,
    targetCohortId: target.targetCohortId,
    targetFilter: target.targetFilter,
    targetBuyerIds: target.targetBuyerIds,
    broadcastName: `${input.campaignName} — publish notify`,
    duplicateGuard: 'campaign_singleton',
  });
}

export async function queueCampaignFollowupNotify(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: CampaignFollowupNotifyInput,
): Promise<CampaignPublishNotifyResult> {
  const segments = await resolveCampaignNotifyRecipientSegments(db, input);
  const buyerIds = selectCampaignNotifyRecipientBuyerIds(segments, input.recipientFilter);

  return createAndQueueCampaignBroadcast(db, {
    ...input,
    buyerIds,
    targetType: 'buyer_selection',
    targetBuyerIds: buyerIds,
    broadcastName: `${input.campaignName} — notify buyers`,
    duplicateGuard: 'none',
  });
}
