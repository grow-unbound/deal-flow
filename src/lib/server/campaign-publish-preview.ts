import type { CampaignScopeType } from '@/lib/server/campaign-broadcast';
import { campaignAudienceLabel, campaignScopeToBroadcastTarget } from '@/lib/server/campaign-broadcast';
import { runCampaignPublishPreflight } from '@/lib/server/campaign-publish-preflight';
import { resolveCampaignHeaderImage } from '@/lib/server/whatsapp-meta-media';
import {
  buildSellerContextFromTenant,
  CAMPAIGN_ANNOUNCEMENT_TEMPLATE_META,
  formatSellerPhoneDisplay,
} from '@/lib/server/whatsapp-seller-context';

export interface CampaignPublishPreviewCampaignInput {
  id?: string | null;
  name: string;
  valid_from: string;
  valid_to: string | null;
  scope_type: CampaignScopeType;
  scope_value: Record<string, unknown>;
  products_count: number;
  pricing_scheme: string;
  buyer_note?: string | null;
  hero_image_url?: string | null;
}

export interface CampaignPublishPreviewResult {
  campaign: {
    id: string | null;
    name: string;
    valid_from: string;
    valid_to: string | null;
    audience_label: string;
    products_count: number;
    pricing_scheme: string;
    buyer_note: string;
    hero_image_url: string | null;
    header_image_url: string;
    header_image_source: 'campaign' | 'tenant_logo' | 'platform_default';
  };
  whatsapp: {
    feature_enabled: boolean;
    notify_available: boolean;
    can_notify: boolean;
    blockers: string[];
    recipient_count: number;
    credits_per_message: number;
    estimated_credits: number;
    estimated_inr: number;
    credits_balance: number;
    credit_price_inr: number;
    template_approved: boolean;
    tenant_phone_configured: boolean;
    broadcast_sending_paused: boolean;
    quality_rating_blocked: boolean;
    recipient_segments?: {
      all_eligible: number;
      not_viewed: number;
      viewed_not_ordered: number;
    };
  };
  template: {
    seller_name: string;
    seller_phone_display: string;
    footer_text: string;
    buttons: Array<{ label: string; type: 'url' | 'quick_reply' }>;
  };
}

export interface CampaignPublishVerificationResult {
  whatsapp: {
    feature_enabled: boolean;
    notify_available: boolean;
    credits_per_message: number;
    credits_balance: number;
    credit_price_inr: number;
    template_approved: boolean;
    tenant_phone_configured: boolean;
    broadcast_sending_paused: boolean;
    quality_rating_blocked: boolean;
  };
  template: {
    seller_name: string;
    seller_phone_display: string;
    footer_text: string;
    buttons: Array<{ label: string; type: 'url' | 'quick_reply' }>;
  };
}

function buildScopeValue(input: {
  scope_type: CampaignScopeType;
  cohort_id?: string | null;
  buyer_ids?: string[];
}): Record<string, unknown> {
  return {
    ...(input.scope_type === 'cohort' && input.cohort_id ? { cohort_id: input.cohort_id } : {}),
    ...(input.scope_type === 'buyer' && input.buyer_ids?.length ? { buyer_ids: input.buyer_ids } : {}),
  };
}

export async function buildCampaignPublishPreview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: {
    tenantId: string;
    notifyWhatsapp: boolean;
    whatsappFeatureEnabled: boolean;
    campaign: CampaignPublishPreviewCampaignInput;
    cohortName?: string | null;
    memberCount?: number | null;
    recipientBuyerIds?: string[];
    recipientSegments?: {
      all_eligible: number;
      not_viewed: number;
      viewed_not_ordered: number;
    };
  },
): Promise<CampaignPublishPreviewResult> {
  const scopeValue =
    Object.keys(input.campaign.scope_value).length > 0
      ? input.campaign.scope_value
      : buildScopeValue({
          scope_type: input.campaign.scope_type,
          cohort_id: null,
          buyer_ids: [],
        });

  const audienceLabel = campaignAudienceLabel({
    scopeType: input.campaign.scope_type,
    scopeValue,
    cohortName: input.cohortName,
    memberCount: input.memberCount,
  });

  const [{ data: tenant }, headerImage] = await Promise.all([
    db
      .schema('app')
      .from('tenants')
      .select('business_name, settings')
      .eq('id', input.tenantId)
      .maybeSingle(),
    resolveCampaignHeaderImage(db, {
      tenantId: input.tenantId,
      campaignId: input.campaign.id,
      heroImageUrl: input.campaign.hero_image_url,
    }),
  ]);

  const sellerContext = buildSellerContextFromTenant(tenant);

  const preflight = input.whatsappFeatureEnabled
      ? await runCampaignPublishPreflight(db, {
        tenantId: input.tenantId,
        scopeType: input.campaign.scope_type,
        scopeValue,
        notifyWhatsapp: input.notifyWhatsapp,
        recipientBuyerIds: input.recipientBuyerIds,
        buyerNote: input.campaign.buyer_note ?? '',
      })
    : {
        can_notify: false,
        blockers: ['WhatsApp broadcast feature is not enabled for this tenant'],
        recipient_count: 0,
        credits_per_message: 4,
        estimated_credits: 0,
        estimated_inr: 0,
        credits_balance: 0,
        credit_price_inr: 0.25,
        template_approved: false,
        tenant_phone_configured: false,
        broadcast_sending_paused: false,
        quality_rating_blocked: false,
      };

  return {
    campaign: {
      id: input.campaign.id ?? null,
      name: input.campaign.name,
      valid_from: input.campaign.valid_from,
      valid_to: input.campaign.valid_to,
      audience_label: audienceLabel,
      products_count: input.campaign.products_count,
      pricing_scheme: input.campaign.pricing_scheme,
      buyer_note: input.campaign.buyer_note ?? '',
      hero_image_url: input.campaign.hero_image_url ?? null,
      header_image_url: headerImage.imageUrl,
      header_image_source: headerImage.source,
    },
    whatsapp: {
      feature_enabled: input.whatsappFeatureEnabled,
      notify_available: input.whatsappFeatureEnabled && preflight.template_approved,
      ...preflight,
      recipient_segments: input.recipientSegments,
    },
    template: {
      seller_name: sellerContext.sellerName,
      seller_phone_display: formatSellerPhoneDisplay(sellerContext.sellerPhone),
      footer_text: CAMPAIGN_ANNOUNCEMENT_TEMPLATE_META.footer_text,
      buttons: CAMPAIGN_ANNOUNCEMENT_TEMPLATE_META.buttons,
    },
  };
}

export async function buildCampaignPublishVerification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: {
    tenantId: string;
    whatsappFeatureEnabled: boolean;
  },
): Promise<CampaignPublishVerificationResult> {
  const fallbackPreflight = {
    can_notify: false,
    blockers: [],
    recipient_count: 0,
    credits_per_message: 4,
    estimated_credits: 0,
    estimated_inr: 0,
    credits_balance: 0,
    credit_price_inr: 0.25,
    template_approved: false,
    tenant_phone_configured: false,
    broadcast_sending_paused: false,
    quality_rating_blocked: false,
  };

  const [{ data: tenant }, preflight] = await Promise.all([
    db
      .schema('app')
      .from('tenants')
      .select('business_name, settings')
      .eq('id', input.tenantId)
      .maybeSingle(),
    input.whatsappFeatureEnabled
      ? runCampaignPublishPreflight(db, {
          tenantId: input.tenantId,
          scopeType: 'all',
          scopeValue: {},
          notifyWhatsapp: false,
          recipientBuyerIds: [],
          buyerNote: '',
        })
      : Promise.resolve(fallbackPreflight),
  ]);

  const sellerContext = buildSellerContextFromTenant(tenant);

  return {
    whatsapp: {
      feature_enabled: input.whatsappFeatureEnabled,
      notify_available: input.whatsappFeatureEnabled && preflight.template_approved,
      credits_per_message: preflight.credits_per_message,
      credits_balance: preflight.credits_balance,
      credit_price_inr: preflight.credit_price_inr,
      template_approved: preflight.template_approved,
      tenant_phone_configured: preflight.tenant_phone_configured,
      broadcast_sending_paused: preflight.broadcast_sending_paused,
      quality_rating_blocked: preflight.quality_rating_blocked,
    },
    template: {
      seller_name: sellerContext.sellerName,
      seller_phone_display: formatSellerPhoneDisplay(sellerContext.sellerPhone),
      footer_text: CAMPAIGN_ANNOUNCEMENT_TEMPLATE_META.footer_text,
      buttons: CAMPAIGN_ANNOUNCEMENT_TEMPLATE_META.buttons,
    },
  };
}

export function scopeTypeFromComposer(scopeType: 'cohort' | 'buyer' | 'all'): CampaignScopeType {
  return scopeType;
}

export function buildComposerScopeValueForPreview(input: {
  scopeType: 'cohort' | 'buyer' | 'all';
  cohortId?: string | null;
  buyerIds?: string[];
}): Record<string, unknown> {
  return buildScopeValue({
    scope_type: scopeTypeFromComposer(input.scopeType),
    cohort_id: input.scopeType === 'cohort' ? input.cohortId : null,
    buyer_ids: input.scopeType === 'buyer' ? input.buyerIds ?? [] : [],
  });
}

export { campaignScopeToBroadcastTarget };
