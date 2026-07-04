import { formatWhatsappDestination } from '@/lib/phone';
import { whatsAppClient, WhatsAppConfigError } from '@/lib/server/whatsapp-client';
import { logWhatsAppMessage, type WhatsAppTriggerSource } from '@/lib/server/whatsapp-ledger';

export interface WhatsappNotificationContext {
  sellerPhone: string;
  sellerName: string;
  sellerLocation: string;
  buyerPhone: string;
  buyerName: string;
  etaHours: number;
  // Optional: only present when the caller has tenant/buyer context available
  // (order/estimate notification routes). Used purely for the app.whatsapp_messages
  // ledger (Phase A instrumentation) — sending still works without these.
  tenantId?: string;
  buyerId?: string;
}

interface WhatsappTemplateBodyParam {
  text: string;
  parameterName?: string;
}

const WHATSAPP_TEMPLATE_LOCALE = 'en';
const WHATSAPP_OTP_TEMPLATE_LOCALE = 'en_US';
const WHATSAPP_LOGIN_PRODUCT_NAME = 'Login to Yukti';

function getWhatsappConfig() {
  return {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID,
  };
}

interface SendWhatsappTemplateLedgerContext {
  tenantId?: string;
  buyerId?: string;
  metaCategory: 'marketing' | 'utility' | 'authentication' | 'service';
  triggerSource: WhatsAppTriggerSource;
}

/**
 * Sends a WhatsApp template message via WhatsAppClient and records the send
 * in the app.whatsapp_messages ledger (Phase A instrumentation — see
 * DealFlow_WhatsApp-Broadcast-Spec_v4.md §5.4). Behavior is unchanged from
 * before the ledger existed: returns silently if credentials/destination are
 * missing, throws on a failed Meta response.
 */
async function sendWhatsappTemplate(
  to: string,
  templateName: string,
  locale: string,
  bodyParams: WhatsappTemplateBodyParam[],
  buttonParam: string,
  ledgerCtx: SendWhatsappTemplateLedgerContext,
): Promise<void> {
  const { token, phoneNumberId } = getWhatsappConfig();
  if (!token || !phoneNumberId) return;

  const destination = formatWhatsappDestination(to);
  if (!destination) return;

  try {
    const result = await whatsAppClient.sendTemplate({
      to: destination,
      templateName,
      locale,
      bodyParams,
      buttonParams: [{ type: 'url', index: '0', text: buttonParam }],
    });

    if (ledgerCtx.tenantId) {
      await logWhatsAppMessage({
        tenantId: ledgerCtx.tenantId,
        buyerId: ledgerCtx.buyerId ?? null,
        recipientPhone: destination,
        metaCategory: ledgerCtx.metaCategory,
        triggerSource: ledgerCtx.triggerSource,
        status: 'sent',
        providerMessageId: result.providerMessageId,
      });
    }
  } catch (error) {
    if (ledgerCtx.tenantId) {
      await logWhatsAppMessage({
        tenantId: ledgerCtx.tenantId,
        buyerId: ledgerCtx.buyerId ?? null,
        recipientPhone: destination,
        metaCategory: ledgerCtx.metaCategory,
        triggerSource: ledgerCtx.triggerSource,
        status: 'failed',
        failureReason: error instanceof Error ? error.message : String(error),
      });
    }
    if (error instanceof WhatsAppConfigError) return;
    throw error;
  }
}

export async function sendOrderReceivedSeller(
  ctx: WhatsappNotificationContext,
  orderId: string,
  orderNumber: string,
  totalAmount: number,
  itemCount: number,
): Promise<void> {
  await sendWhatsappTemplate(
    ctx.sellerPhone,
    'order_received_seller',
    WHATSAPP_TEMPLATE_LOCALE,
    [
      { text: ctx.sellerLocation, parameterName: 'seller_location' },
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: ctx.buyerPhone, parameterName: 'buyer_phone_number' },
      { text: orderNumber, parameterName: 'order_number' },
      { text: String(Math.round(totalAmount / 100)), parameterName: 'total_amount' },
      { text: String(itemCount), parameterName: 'item_count' },
      { text: String(ctx.etaHours), parameterName: 'eta' },
    ],
    orderId,
    {
      tenantId: ctx.tenantId,
      buyerId: ctx.buyerId,
      metaCategory: 'utility',
      triggerSource: 'order_placed',
    },
  );
}

export async function sendOrderReceivedBuyer(
  ctx: WhatsappNotificationContext,
  orderId: string,
  orderNumber: string,
  totalAmount: number,
  itemCount: number,
): Promise<void> {
  await sendWhatsappTemplate(
    ctx.buyerPhone,
    'order_received_buyer',
    WHATSAPP_TEMPLATE_LOCALE,
    [
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: String(itemCount), parameterName: 'item_count' },
      { text: orderNumber, parameterName: 'order_number' },
      { text: String(Math.round(totalAmount / 100)), parameterName: 'total_amount' },
      { text: ctx.sellerName, parameterName: 'seller_name' },
      { text: ctx.sellerLocation, parameterName: 'seller_location' },
      { text: String(ctx.etaHours), parameterName: 'eta' },
    ],
    orderId,
    {
      tenantId: ctx.tenantId,
      buyerId: ctx.buyerId,
      metaCategory: 'utility',
      triggerSource: 'order_placed',
    },
  );
}

export async function sendRequestReceivedSeller(
  ctx: WhatsappNotificationContext,
  estimateId: string,
  estimateNumber: string,
  totalAmount: number,
  itemCount: number,
): Promise<void> {
  await sendWhatsappTemplate(
    ctx.sellerPhone,
    'request_received_seller',
    WHATSAPP_TEMPLATE_LOCALE,
    [
      { text: ctx.sellerLocation, parameterName: 'seller_location' },
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: ctx.buyerPhone, parameterName: 'buyer_phone_number' },
      { text: estimateNumber, parameterName: 'request_number' },
      { text: String(Math.round(totalAmount / 100)), parameterName: 'total_amount' },
      { text: String(itemCount), parameterName: 'item_count' },
      { text: String(ctx.etaHours), parameterName: 'eta' },
    ],
    estimateId,
    {
      tenantId: ctx.tenantId,
      buyerId: ctx.buyerId,
      metaCategory: 'utility',
      triggerSource: 'enquiry_received',
    },
  );
}

export async function sendRequestReceivedBuyer(
  ctx: WhatsappNotificationContext,
  estimateId: string,
  estimateNumber: string,
  totalAmount: number,
  itemCount: number,
): Promise<void> {
  await sendWhatsappTemplate(
    ctx.buyerPhone,
    'request_received_buyer',
    WHATSAPP_TEMPLATE_LOCALE,
    [
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: String(itemCount), parameterName: 'item_count' },
      { text: estimateNumber, parameterName: 'estimate_number' },
      { text: String(Math.round(totalAmount / 100)), parameterName: 'total_amount' },
      { text: ctx.sellerName, parameterName: 'seller_name' },
      { text: ctx.sellerLocation, parameterName: 'seller_location' },
      { text: String(ctx.etaHours), parameterName: 'eta' },
    ],
    estimateId,
    {
      tenantId: ctx.tenantId,
      buyerId: ctx.buyerId,
      metaCategory: 'utility',
      triggerSource: 'enquiry_received',
    },
  );
}

/**
 * Sends the login OTP template. Ledger writes here are Phase A instrumentation
 * (§3.1 — "retrofitted through the same app.whatsapp_messages ledger so
 * utility/auth consumption is tracked identically to broadcast consumption").
 * tenantId is optional since OTP callers (phone-otp/send) don't always resolve
 * a single tenant before the OTP is sent — when absent, the send still happens
 * exactly as before, just without a ledger row.
 */
export async function sendLoginOtpWhatsapp(
  phone: string,
  otp: string,
  ledgerCtx?: { tenantId?: string; buyerId?: string },
) {
  const { token, phoneNumberId } = getWhatsappConfig();
  const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER;

  if (!token || !phoneNumberId || !adminNumber) {
    throw new Error('Missing WhatsApp OTP configuration');
  }

  const destination = formatWhatsappDestination(phone);

  try {
    const result = await whatsAppClient.sendTemplate({
      to: destination,
      templateName: 'login_otp',
      locale: WHATSAPP_OTP_TEMPLATE_LOCALE,
      bodyParams: [
        { text: otp },
        { text: WHATSAPP_LOGIN_PRODUCT_NAME },
        { text: adminNumber },
      ],
      buttonParams: [{ type: 'url', index: '0', text: otp }],
    });

    if (ledgerCtx?.tenantId) {
      await logWhatsAppMessage({
        tenantId: ledgerCtx.tenantId,
        buyerId: ledgerCtx.buyerId ?? null,
        recipientPhone: destination,
        metaCategory: 'authentication',
        triggerSource: 'otp_login',
        status: 'sent',
        providerMessageId: result.providerMessageId,
      });
    }
  } catch (error) {
    if (ledgerCtx?.tenantId) {
      await logWhatsAppMessage({
        tenantId: ledgerCtx.tenantId,
        buyerId: ledgerCtx.buyerId ?? null,
        recipientPhone: destination,
        metaCategory: 'authentication',
        triggerSource: 'otp_login',
        status: 'failed',
        failureReason: error instanceof Error ? error.message : String(error),
      });
    }
    if (error instanceof WhatsAppConfigError) {
      throw new Error('Missing WhatsApp OTP configuration');
    }
    throw error;
  }
}
