/**
 * Preflight checks before campaign publish + WhatsApp notify.
 */

import { formatWhatsappDestination, isValidIndianMobile, normalizeIndianPhone } from '@/lib/phone';
import { resolveBroadcastAudience } from '@/lib/server/whatsapp-broadcast-audience';
import { campaignScopeToBroadcastTarget } from '@/lib/server/campaign-broadcast';
import type { CampaignScopeType } from '@/lib/server/campaign-broadcast';

export interface CampaignPublishPreflightInput {
  tenantId: string;
  scopeType: CampaignScopeType;
  scopeValue: Record<string, unknown> | null;
  notifyWhatsapp: boolean;
  recipientBuyerIds?: string[];
  buyerNote?: string | null;
}

export interface CampaignPublishPreflightResult {
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
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildSellerPhone(settings: Record<string, unknown> | null): string {
  const business = asRecord(settings?.business);
  const buyerApp = asRecord(settings?.buyer_app);
  return normalizeIndianPhone(
    readString(buyerApp, 'whatsapp_number')
    ?? readString(business, 'phone')
    ?? process.env.WHATSAPP_ADMIN_NUMBER
    ?? '',
  );
}

export async function runCampaignPublishPreflight(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: CampaignPublishPreflightInput,
): Promise<CampaignPublishPreflightResult> {
  const blockers: string[] = [];
  const target = campaignScopeToBroadcastTarget({
    scopeType: input.scopeType,
    scopeValue: input.scopeValue,
  });

  const eligibleBuyerIds = input.recipientBuyerIds
    ? Array.from(new Set(input.recipientBuyerIds))
    : await resolveBroadcastAudience(db, {
        tenantId: input.tenantId,
        targetType: target.targetType,
        targetCohortId: target.targetCohortId,
        targetFilter: target.targetFilter,
        targetBuyerIds: target.targetBuyerIds,
      });

  const recipientCount = eligibleBuyerIds.length;

  const [{ data: tenant }, { data: template }, { data: platformState }] = await Promise.all([
    db
      .schema('app')
      .from('tenants')
      .select('whatsapp_credits_balance, settings')
      .eq('id', input.tenantId)
      .maybeSingle(),
    db
      .schema('app')
      .from('whatsapp_templates')
      .select('approval_status')
      .eq('use_case', 'campaigns')
      .eq('meta_template_name', 'campaign_published_buyer')
      .is('tenant_id', null)
      .is('deleted_at', null)
      .maybeSingle(),
    db
      .schema('app')
      .from('whatsapp_platform_config')
      .select('broadcast_sending_paused, quality_rating_state')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  const creditsBalance = Number(tenant?.whatsapp_credits_balance ?? 0);
  const sellerPhone = buildSellerPhone(asRecord(tenant?.settings));
  const tenantPhoneConfigured = Boolean(sellerPhone && isValidIndianMobile(sellerPhone));
  const templateApproved = template?.approval_status === 'approved';
  const broadcastSendingPaused = Boolean(platformState?.broadcast_sending_paused);

  let creditsPerMessage = 4;
  const { data: rateRow } = await db
    .schema('app')
    .from('whatsapp_rate_card')
    .select('credits_per_message')
    .eq('meta_category', 'marketing')
    .is('deleted_at', null)
    .maybeSingle();
  if (rateRow?.credits_per_message) creditsPerMessage = Number(rateRow.credits_per_message);

  let creditPriceInr = 0.25;
  const { data: pricingRow } = await db
    .schema('app')
    .from('whatsapp_credit_pricing')
    .select('credit_price_inr')
    .is('deleted_at', null)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pricingRow?.credit_price_inr) creditPriceInr = Number(pricingRow.credit_price_inr);

  const estimatedCredits = recipientCount * creditsPerMessage;
  const estimatedInr = Math.round(estimatedCredits * creditPriceInr * 100) / 100;

  if (!input.notifyWhatsapp) {
    return {
      can_notify: false,
      blockers: [],
      recipient_count: recipientCount,
      credits_per_message: creditsPerMessage,
      estimated_credits: estimatedCredits,
      estimated_inr: estimatedInr,
      credits_balance: creditsBalance,
      credit_price_inr: creditPriceInr,
      template_approved: templateApproved,
      tenant_phone_configured: tenantPhoneConfigured,
      broadcast_sending_paused: broadcastSendingPaused,
      quality_rating_blocked: platformState?.quality_rating_state === 'red',
    };
  }

  if (!input.buyerNote?.trim()) {
    blockers.push('Add a buyer note before sending the WhatsApp campaign announcement');
  }
  if (recipientCount === 0) blockers.push('No opted-in buyers with valid phone numbers in this audience');
  if (!templateApproved) blockers.push('WhatsApp template is not approved yet');
  if (!tenantPhoneConfigured) blockers.push('Tenant WhatsApp contact number is missing or invalid');
  if (broadcastSendingPaused) blockers.push('Broadcast sending is temporarily paused platform-wide');
  if (platformState?.quality_rating_state === 'red') {
    blockers.push('WhatsApp quality rating is red — marketing sends are blocked');
  }
  if (creditsBalance < estimatedCredits) {
    blockers.push(`Insufficient credits (${creditsBalance} available, ${estimatedCredits} required)`);
  }

  // Validate wa.me destination early
  if (tenantPhoneConfigured) {
    try {
      formatWhatsappDestination(sellerPhone);
    } catch {
      blockers.push('Tenant WhatsApp contact number could not be formatted for Enquire button');
    }
  }

  return {
    can_notify: blockers.length === 0,
    blockers,
    recipient_count: recipientCount,
    credits_per_message: creditsPerMessage,
    estimated_credits: estimatedCredits,
    estimated_inr: estimatedInr,
    credits_balance: creditsBalance,
    credit_price_inr: creditPriceInr,
    template_approved: templateApproved,
    tenant_phone_configured: tenantPhoneConfigured,
    broadcast_sending_paused: broadcastSendingPaused,
    quality_rating_blocked: platformState?.quality_rating_state === 'red',
  };
}
