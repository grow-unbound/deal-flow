/**
 * Queue a campaign_announcement broadcast after first publish.
 */

import { buildBroadcastMessageQueue } from '@/lib/server/whatsapp-broadcast-send';
import { campaignScopeToBroadcastTarget } from '@/lib/server/campaign-broadcast';
import type { CampaignScopeType } from '@/lib/server/campaign-broadcast';
import { runCampaignPublishPreflight } from '@/lib/server/campaign-publish-preflight';
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

export interface CampaignPublishNotifyResult {
  broadcast_id: string;
  recipient_count: number;
  scheduled: boolean;
}

export async function queueCampaignPublishNotify(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: CampaignPublishNotifyInput,
): Promise<CampaignPublishNotifyResult> {
  const preflight = await runCampaignPublishPreflight(db, {
    tenantId: input.tenantId,
    scopeType: input.scopeType,
    scopeValue: input.scopeValue,
    notifyWhatsapp: true,
  });

  if (!preflight.can_notify) {
    throw new Error(preflight.blockers[0] ?? 'WhatsApp notify preflight failed');
  }

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

  const target = campaignScopeToBroadcastTarget({
    scopeType: input.scopeType,
    scopeValue: input.scopeValue,
  });

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
      name: `${input.campaignName} — publish notify`,
      whatsapp_template_id: template.id,
      use_case: 'campaign_announcement',
      target_type: target.targetType,
      target_cohort_id: target.targetCohortId ?? null,
      target_filter: target.targetFilter ?? null,
      target_buyer_ids: target.targetBuyerIds ?? null,
      linked_campaign_id: input.campaignId,
      variable_bindings: {
        buyer_note: input.buyerNote?.trim() || 'Check out our latest offers.',
      },
      status: input.scheduledFor ? 'scheduled' : 'sending',
      scheduled_for: input.scheduledFor ?? null,
      estimated_recipient_count: preflight.recipient_count,
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

  const eligibleBuyerIds = await resolveBroadcastAudience(db, {
    tenantId: input.tenantId,
    targetType: target.targetType,
    targetCohortId: target.targetCohortId,
    targetFilter: target.targetFilter,
    targetBuyerIds: target.targetBuyerIds,
  });

  const queueInputs = await buildBroadcastMessageQueue(db, {
    tenantId: input.tenantId,
    whatsappBroadcastId: broadcast.id as string,
    buyerIds: eligibleBuyerIds,
    template,
    variableBindings: {
      buyer_note: input.buyerNote?.trim() || 'Check out our latest offers.',
    },
    linkedCampaignId: input.campaignId,
    scheduledSendAt: input.scheduledFor ?? null,
    headerMediaId: metaHeaderMediaId,
    headerImageLink: metaHeaderMediaId ? null : resolvedHeader.imageUrl,
  });

  for (const queueInput of queueInputs) {
    const result = await enqueueWhatsAppMessage(queueInput);
    if (!result.enqueued) {
      throw new Error('Failed to enqueue one or more campaign publish messages');
    }
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
    triggerWhatsAppDispatch();
  }

  return {
    broadcast_id: broadcast.id as string,
    recipient_count: queueInputs.length,
    scheduled: Boolean(input.scheduledFor),
  };
}
