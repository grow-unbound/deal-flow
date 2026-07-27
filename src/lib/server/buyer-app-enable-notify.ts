import { firstNameFromValue, formatWhatsappDestination, isValidIndianMobile } from '@/lib/phone';
import { buildSellerContextFromTenant } from '@/lib/server/whatsapp-seller-context';
import {
  enqueueWhatsAppMessage,
  lookupApprovedTemplateMeta,
  triggerWhatsAppDispatch,
  type WhatsAppSendPayload,
} from '@/lib/server/whatsapp-enqueue';
import { assertTemplatePayloadValid } from '@/lib/server/whatsapp-template-validation';
import type { BuyerAppEnablePreviewResponse } from '@/types/buyer-app-enable';

export const BUYER_APP_ENABLED_TEMPLATE = 'buyer_app_enabled';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

interface BuyerRow {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
}

interface TenantRow {
  id: string;
  business_name: string;
  settings: Record<string, unknown> | null;
  whatsapp_credits_balance: number | string | null;
}

const TEMPLATE_VALIDATION_SHAPE = {
  meta_template_name: BUYER_APP_ENABLED_TEMPLATE,
  variables: [
    { key: 'buyer_name' },
    { key: 'seller_name' },
  ],
};

export function buildBuyerAppEnabledPreviewMessage(
  buyerName: string,
  sellerName: string,
): string {
  return [
    `Hi ${buyerName},`,
    '',
    `${sellerName} has enabled the catalog app for you.`,
    '',
    'You can now explore their latest stock, check prices, and place orders anytime.',
  ].join('\n');
}

export function resolveBuyerDisplayName(buyer: Pick<BuyerRow, 'business_name' | 'contact_name'>): string {
  return firstNameFromValue(buyer.contact_name)
    ?? firstNameFromValue(buyer.business_name)
    ?? buyer.business_name;
}

async function loadMarketingCreditsPerMessage(db: DbClient): Promise<number> {
  const { data } = await db
    .schema('app')
    .from('whatsapp_rate_card')
    .select('credits_per_message')
    .eq('meta_category', 'marketing')
    .maybeSingle();

  const value = Number(data?.credits_per_message ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

interface ResolveBuyerAppEnableNotifyRecipientsOptions {
  /** Preview runs before PATCH; send runs after buyers are already enabled. */
  requireNotYetEnabled?: boolean;
}

/**
 * buyer_app_enabled WhatsApp bypasses broadcast consent/opt-out gates — buyers need
 * the enable notice before they can log in and record consent.
 */
async function resolveBuyerAppEnableNotifyRecipientIds(
  db: DbClient,
  tenantId: string,
  buyerIds: string[],
  options: ResolveBuyerAppEnableNotifyRecipientsOptions = {},
): Promise<string[]> {
  if (buyerIds.length === 0) return [];

  const requireNotYetEnabled = options.requireNotYetEnabled ?? true;

  let query = db
    .schema('app')
    .from('buyers')
    .select('id, phone')
    .eq('tenant_id', tenantId)
    .in('id', buyerIds)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (requireNotYetEnabled) {
    query = query.eq('buyer_app_enabled', false);
  }

  const { data: buyers, error } = await query;

  if (error) {
    console.error('[buyer-app-enable-notify] recipient resolve failed', error);
    return [];
  }

  return ((buyers ?? []) as Array<{ id: string; phone: string | null }>)
    .filter((buyer) => buyer.phone && isValidIndianMobile(buyer.phone))
    .map((buyer) => buyer.id);
}

function buildSendPayload(
  locale: string,
  buyerName: string,
  sellerName: string,
): WhatsAppSendPayload {
  return {
    meta_template_name: BUYER_APP_ENABLED_TEMPLATE,
    locale,
    body_params: [
      { text: buyerName, parameter_name: 'buyer_name' },
      { text: sellerName, parameter_name: 'seller_name' },
    ],
  };
}

export async function buildBuyerAppEnablePreview(
  db: DbClient,
  tenantId: string,
  buyerIds: string[],
): Promise<BuyerAppEnablePreviewResponse> {
  const selectedCount = buyerIds.length;
  const recipientIds = await resolveBuyerAppEnableNotifyRecipientIds(db, tenantId, buyerIds);
  const creditsPerBuyer = await loadMarketingCreditsPerMessage(db);

  const { data: tenant, error: tenantError } = await db
    .schema('app')
    .from('tenants')
    .select('id, business_name, settings, whatsapp_credits_balance')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    throw new Error('Failed to load tenant context');
  }

  const sellerContext = buildSellerContextFromTenant(tenant as TenantRow);
  const creditsBalance = Number((tenant as TenantRow).whatsapp_credits_balance ?? 0);

  let previewBuyerName = '{{buyer_name}}';
  if (buyerIds.length === 1) {
    const { data: buyer } = await db
      .schema('app')
      .from('buyers')
      .select('id, business_name, contact_name, phone')
      .eq('id', buyerIds[0]!)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (buyer) {
      previewBuyerName = resolveBuyerDisplayName(buyer as BuyerRow);
    }
  }

  return {
    preview_message: buildBuyerAppEnabledPreviewMessage(previewBuyerName, sellerContext.sellerName),
    preview_buyer_name: previewBuyerName,
    selected_count: selectedCount,
    recipient_count: recipientIds.length,
    credits_per_buyer: creditsPerBuyer,
    total_credits: creditsPerBuyer * recipientIds.length,
    credits_balance: Number.isFinite(creditsBalance) ? creditsBalance : 0,
  };
}

export async function queueBuyerAppEnabledMessages(
  db: DbClient,
  tenantId: string,
  buyerIds: string[],
): Promise<{ sent_count: number; eligible_count: number; skipped_count: number }> {
  if (buyerIds.length === 0) {
    return { sent_count: 0, eligible_count: 0, skipped_count: 0 };
  }

  const templateMeta = await lookupApprovedTemplateMeta(BUYER_APP_ENABLED_TEMPLATE);
  if (!templateMeta) {
    console.error('[buyer-app-enable-notify] approved template not found');
    return { sent_count: 0, eligible_count: 0, skipped_count: buyerIds.length };
  }

  const eligibleIds = await resolveBuyerAppEnableNotifyRecipientIds(db, tenantId, buyerIds, {
    requireNotYetEnabled: false,
  });
  if (eligibleIds.length === 0) {
    return { sent_count: 0, eligible_count: 0, skipped_count: buyerIds.length };
  }

  const { data: tenant, error: tenantError } = await db
    .schema('app')
    .from('tenants')
    .select('id, business_name, settings')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    console.error('[buyer-app-enable-notify] tenant load failed', tenantError);
    return { sent_count: 0, eligible_count: eligibleIds.length, skipped_count: buyerIds.length };
  }

  const sellerContext = buildSellerContextFromTenant(tenant as TenantRow);

  const { data: buyers, error: buyersError } = await db
    .schema('app')
    .from('buyers')
    .select('id, business_name, contact_name, phone')
    .eq('tenant_id', tenantId)
    .in('id', eligibleIds)
    .is('deleted_at', null);

  if (buyersError) {
    console.error('[buyer-app-enable-notify] buyers load failed', buyersError);
    return { sent_count: 0, eligible_count: eligibleIds.length, skipped_count: buyerIds.length };
  }

  const buyerRows = ((buyers ?? []) as BuyerRow[]).filter(
    (buyer) => buyer.phone && isValidIndianMobile(buyer.phone),
  );
  const messageIds: string[] = [];
  let sentCount = 0;

  for (const buyer of buyerRows) {
    const destination = formatWhatsappDestination(buyer.phone!);
    if (!destination) continue;

    const buyerName = resolveBuyerDisplayName(buyer);
    const sendPayload = buildSendPayload(templateMeta.locale, buyerName, sellerContext.sellerName);

    try {
      assertTemplatePayloadValid(TEMPLATE_VALIDATION_SHAPE, sendPayload);
    } catch (error) {
      console.error('[buyer-app-enable-notify] payload validation failed', error);
      continue;
    }

    const result = await enqueueWhatsAppMessage({
      tenantId,
      buyerId: buyer.id,
      recipientPhone: destination,
      metaCategory: 'marketing',
      triggerSource: 'buyer_app_enabled',
      sendPayload,
    });

    if (result.enqueued && result.messageId) {
      messageIds.push(result.messageId);
      sentCount += 1;
    }
  }

  if (messageIds.length > 0) {
    await triggerWhatsAppDispatch(messageIds);
  }

  return {
    sent_count: sentCount,
    eligible_count: eligibleIds.length,
    skipped_count: buyerIds.length - sentCount,
  };
}
