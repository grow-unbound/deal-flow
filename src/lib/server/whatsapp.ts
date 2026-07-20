import { formatWhatsappDestination } from '@/lib/phone';
import { formatSellerPhoneDisplay } from '@/lib/server/whatsapp-seller-context';
import {
  enqueueWhatsAppMessage,
  getPlatformTenantId,
  lookupApprovedTemplateMeta,
  triggerWhatsAppDispatch,
  type WhatsAppSendPayload,
} from '@/lib/server/whatsapp-enqueue';
import type { WhatsAppTriggerSource } from '@/lib/server/whatsapp-ledger';

export interface WhatsappNotificationContext {
  sellerPhone: string;
  sellerName: string;
  sellerLocation: string;
  buyerFacingSellerName: string;
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

const WHATSAPP_OTP_TEMPLATE_LOCALE = 'en_US';
const WHATSAPP_LOGIN_PRODUCT_NAME = 'Login to Yukti';
const FALLBACK_TEMPLATE_LOCALE = 'en';

/** Buyer-app totals are stored in whole rupees — Meta body params expect the same scale. */
export function formatWhatsappInrAmount(amount: number): string {
  return String(Math.round(amount));
}

async function resolveTemplateLocale(templateName: string): Promise<string> {
  const meta = await lookupApprovedTemplateMeta(templateName);
  return meta?.locale ?? FALLBACK_TEMPLATE_LOCALE;
}

interface EnqueueTemplateContext {
  tenantId: string;
  buyerId?: string;
  metaCategory: 'marketing' | 'utility' | 'authentication' | 'service';
  triggerSource: WhatsAppTriggerSource;
  relatedEntityType?: 'estimates' | 'orders' | 'invoices';
  relatedEntityId?: string;
}

function buildSendPayload(
  templateName: string,
  locale: string,
  bodyParams: WhatsappTemplateBodyParam[],
  buttonParam?: string,
): WhatsAppSendPayload {
  return {
    meta_template_name: templateName,
    locale,
    body_params: bodyParams.map((p) => ({
      text: p.text,
      ...(p.parameterName ? { parameter_name: p.parameterName } : {}),
    })),
    ...(buttonParam ? { button_params: [{ type: 'url', index: '0', text: buttonParam }] } : {}),
  };
}

async function enqueueWhatsappTemplate(
  to: string,
  templateName: string,
  locale: string,
  bodyParams: WhatsappTemplateBodyParam[],
  buttonParam: string | undefined,
  ctx: EnqueueTemplateContext,
): Promise<boolean> {
  const destination = formatWhatsappDestination(to);
  if (!destination) {
    return false;
  }
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

  if (result.skipped === 'duplicate') return true;
  if (!result.enqueued || !result.messageId) {
    return false;
  }

  const dispatch = await triggerWhatsAppDispatch([result.messageId]);
  return Boolean(dispatch?.ok && dispatch.dispatched > 0);
}

export async function sendOrderReceivedSeller(
  ctx: WhatsappNotificationContext,
  orderId: string,
  orderNumber: string,
  totalAmount: number,
  itemCount: number,
): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const locale = await resolveTemplateLocale('order_received_seller');
  return enqueueWhatsappTemplate(
    ctx.sellerPhone,
    'order_received_seller',
    locale,
    [
      { text: ctx.sellerLocation, parameterName: 'seller_location' },
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: ctx.buyerPhone, parameterName: 'buyer_phone_number' },
      { text: orderNumber, parameterName: 'order_number' },
      { text: formatWhatsappInrAmount(totalAmount), parameterName: 'total_amount' },
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
): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const locale = await resolveTemplateLocale('order_received_buyer');
  return enqueueWhatsappTemplate(
    ctx.buyerPhone,
    'order_received_buyer',
    locale,
    [
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: String(itemCount), parameterName: 'item_count' },
      { text: orderNumber, parameterName: 'order_number' },
      { text: formatWhatsappInrAmount(totalAmount), parameterName: 'total_amount' },
      { text: ctx.buyerFacingSellerName, parameterName: 'seller_name' },
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
): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const locale = await resolveTemplateLocale('request_received_seller');
  return enqueueWhatsappTemplate(
    ctx.sellerPhone,
    'request_received_seller',
    locale,
    [
      { text: ctx.sellerLocation, parameterName: 'seller_location' },
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: ctx.buyerPhone, parameterName: 'buyer_phone_number' },
      { text: estimateNumber, parameterName: 'request_number' },
      { text: formatWhatsappInrAmount(totalAmount), parameterName: 'total_amount' },
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
): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const locale = await resolveTemplateLocale('request_received_buyer');
  return enqueueWhatsappTemplate(
    ctx.buyerPhone,
    'request_received_buyer',
    locale,
    [
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: String(itemCount), parameterName: 'item_count' },
      { text: estimateNumber, parameterName: 'estimate_number' },
      { text: formatWhatsappInrAmount(totalAmount), parameterName: 'total_amount' },
      { text: ctx.buyerFacingSellerName, parameterName: 'seller_name' },
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

export async function sendRequestUpdateBuyer(
  ctx: WhatsappNotificationContext,
  estimateId: string,
  requestNumber: string,
  totalAmount: number,
  itemCount: number,
): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const locale = await resolveTemplateLocale('request_update_buyer');
  return enqueueWhatsappTemplate(
    ctx.buyerPhone,
    'request_update_buyer',
    locale,
    [
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: requestNumber, parameterName: 'request_number' },
      { text: formatWhatsappInrAmount(totalAmount), parameterName: 'total_amount' },
      { text: String(itemCount), parameterName: 'item_count' },
      { text: ctx.buyerFacingSellerName, parameterName: 'seller_name' },
      { text: formatSellerPhoneDisplay(ctx.sellerPhone), parameterName: 'seller_phone_number' },
    ],
    estimateId,
    {
      tenantId: ctx.tenantId,
      buyerId: ctx.buyerId,
      metaCategory: 'utility',
      triggerSource: 'estimate_update',
      relatedEntityType: 'estimates',
      relatedEntityId: estimateId,
    },
  );
}

export async function sendInvoiceUpdateBuyer(
  ctx: WhatsappNotificationContext,
  invoiceId: string,
  invoiceNumber: string,
  totalAmount: number,
  itemCount: number,
): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const locale = await resolveTemplateLocale('invoice_update_buyer');
  return enqueueWhatsappTemplate(
    ctx.buyerPhone,
    'invoice_update_buyer',
    locale,
    [
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: invoiceNumber, parameterName: 'invoice_number' },
      { text: formatWhatsappInrAmount(totalAmount), parameterName: 'total_amount' },
      { text: String(itemCount), parameterName: 'item_count' },
      { text: ctx.buyerFacingSellerName, parameterName: 'seller_name' },
      { text: formatSellerPhoneDisplay(ctx.sellerPhone), parameterName: 'seller_phone_number' },
    ],
    invoiceId,
    {
      tenantId: ctx.tenantId,
      buyerId: ctx.buyerId,
      metaCategory: 'utility',
      triggerSource: 'invoice_update',
      relatedEntityType: 'invoices',
      relatedEntityId: invoiceId,
    },
  );
}

export async function sendBuyerPaymentReminder(
  ctx: WhatsappNotificationContext,
  invoiceId: string,
  dueInvoiceCount: string,
  outstandingAmount: string,
  dueStatus: string,
): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const locale = await resolveTemplateLocale('buyer_payment_reminder');
  return enqueueWhatsappTemplate(
    ctx.buyerPhone,
    'buyer_payment_reminder',
    locale,
    [
      { text: ctx.buyerName, parameterName: 'buyer_name' },
      { text: ctx.buyerFacingSellerName, parameterName: 'seller_name' },
      { text: dueInvoiceCount, parameterName: 'due_invoice_count' },
      { text: outstandingAmount, parameterName: 'outstanding_amount' },
      { text: dueStatus, parameterName: 'due_status' },
      { text: formatSellerPhoneDisplay(ctx.sellerPhone), parameterName: 'seller_phone_number' },
    ],
    undefined,
    {
      tenantId: ctx.tenantId,
      buyerId: ctx.buyerId,
      metaCategory: 'utility',
      triggerSource: 'payment_reminder',
      relatedEntityType: 'invoices',
      relatedEntityId: invoiceId,
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

  if (result.messageId) {
    const dispatch = await triggerWhatsAppDispatch([result.messageId]);
    if (!dispatch?.ok || dispatch.dispatched === 0) {
      throw new Error('Failed to send OTP WhatsApp message');
    }
  }
}
