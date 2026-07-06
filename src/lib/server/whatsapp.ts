import { formatWhatsappDestination } from '@/lib/phone';
import {
  enqueueWhatsAppMessage,
  getPlatformTenantId,
  triggerWhatsAppDispatch,
  type WhatsAppSendPayload,
} from '@/lib/server/whatsapp-enqueue';
import type { WhatsAppTriggerSource } from '@/lib/server/whatsapp-ledger';

export interface WhatsappNotificationContext {
  sellerPhone: string;
  sellerName: string;
  sellerLocation: string;
  buyerPhone: string;
  buyerName: string;
  etaHours: number;
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

interface EnqueueTemplateContext {
  tenantId: string;
  buyerId?: string;
  metaCategory: 'marketing' | 'utility' | 'authentication' | 'service';
  triggerSource: WhatsAppTriggerSource;
  relatedEntityType?: 'estimates' | 'orders';
  relatedEntityId?: string;
}

function buildSendPayload(
  templateName: string,
  locale: string,
  bodyParams: WhatsappTemplateBodyParam[],
  buttonParam: string,
): WhatsAppSendPayload {
  return {
    meta_template_name: templateName,
    locale,
    body_params: bodyParams.map((p) => ({
      text: p.text,
      ...(p.parameterName ? { parameter_name: p.parameterName } : {}),
    })),
    button_params: [{ type: 'url', index: '0', text: buttonParam }],
  };
}

async function enqueueWhatsappTemplate(
  to: string,
  templateName: string,
  locale: string,
  bodyParams: WhatsappTemplateBodyParam[],
  buttonParam: string,
  ctx: EnqueueTemplateContext,
): Promise<boolean> {
  const destination = formatWhatsappDestination(to);
  if (!destination) return false;

  const result = await enqueueWhatsAppMessage({
    tenantId: ctx.tenantId,
    buyerId: ctx.buyerId ?? null,
    recipientPhone: destination,
    metaCategory: ctx.metaCategory,
    triggerSource: ctx.triggerSource,
    sendPayload: buildSendPayload(templateName, locale, bodyParams, buttonParam),
    relatedEntityType: ctx.relatedEntityType ?? null,
    relatedEntityId: ctx.relatedEntityId ?? null,
  });

  if (result.enqueued) {
    triggerWhatsAppDispatch();
  }

  return result.enqueued || result.skipped === 'duplicate';
}

export async function sendOrderReceivedSeller(
  ctx: WhatsappNotificationContext,
  orderId: string,
  orderNumber: string,
  totalAmount: number,
  itemCount: number,
): Promise<void> {
  if (!ctx.tenantId) return;
  await enqueueWhatsappTemplate(
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
      relatedEntityType: 'orders',
      relatedEntityId: orderId,
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
  if (!ctx.tenantId) return;
  await enqueueWhatsappTemplate(
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
      relatedEntityType: 'orders',
      relatedEntityId: orderId,
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
  if (!ctx.tenantId) return;
  await enqueueWhatsappTemplate(
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
      relatedEntityType: 'estimates',
      relatedEntityId: estimateId,
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
  if (!ctx.tenantId) return;
  await enqueueWhatsappTemplate(
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
      relatedEntityType: 'estimates',
      relatedEntityId: estimateId,
    },
  );
}

/**
 * Enqueues the login OTP template. Billed to WHATSAPP_PLATFORM_TENANT_ID.
 */
export async function sendLoginOtpWhatsapp(phone: string, otp: string): Promise<void> {
  const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER;
  const platformTenantId = getPlatformTenantId();

  if (!adminNumber) {
    throw new Error('Missing WhatsApp OTP configuration');
  }
  if (!platformTenantId) {
    throw new Error('Missing WHATSAPP_PLATFORM_TENANT_ID for OTP billing');
  }

  const destination = formatWhatsappDestination(phone);
  if (!destination) {
    throw new Error('Invalid phone number for OTP');
  }

  const result = await enqueueWhatsAppMessage({
    tenantId: platformTenantId,
    recipientPhone: destination,
    metaCategory: 'authentication',
    triggerSource: 'otp_login',
    sendPayload: {
      meta_template_name: 'login_otp',
      locale: WHATSAPP_OTP_TEMPLATE_LOCALE,
      body_params: [
        { text: otp },
        { text: WHATSAPP_LOGIN_PRODUCT_NAME },
        { text: adminNumber },
      ],
      button_params: [{ type: 'url', index: '0', text: otp }],
    },
  });

  if (!result.enqueued && result.skipped !== 'duplicate') {
    throw new Error('Failed to enqueue OTP WhatsApp message');
  }

  triggerWhatsAppDispatch();
}
