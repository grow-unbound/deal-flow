import { formatWhatsappDestination } from '@/lib/phone';

export interface WhatsappNotificationContext {
  sellerPhone: string;
  sellerName: string;
  sellerLocation: string;
  buyerPhone: string;
  buyerName: string;
  etaHours: number;
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

async function sendWhatsappTemplate(
  to: string,
  templateName: string,
  locale: string,
  bodyParams: WhatsappTemplateBodyParam[],
  buttonParam: string,
): Promise<void> {
  const { token, phoneNumberId } = getWhatsappConfig();
  if (!token || !phoneNumberId) return;

  const destination = formatWhatsappDestination(to);
  if (!destination) return;

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destination,
        type: 'template',
        template: {
          name: templateName,
          language: { code: locale },
          components: [
            {
              type: 'body',
              parameters: bodyParams.map((param) => ({
                type: 'text',
                text: param.text,
                ...(param.parameterName ? { parameter_name: param.parameterName } : {}),
              })),
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: buttonParam }],
            },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp send failed [${templateName}] (${response.status}): ${body}`);
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
  );
}

export async function sendLoginOtpWhatsapp(phone: string, otp: string) {
  const { token, phoneNumberId } = getWhatsappConfig();
  const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER;

  if (!token || !phoneNumberId || !adminNumber) {
    throw new Error('Missing WhatsApp OTP configuration');
  }

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formatWhatsappDestination(phone),
        type: 'template',
        template: {
          name: 'login_otp',
          language: { code: WHATSAPP_OTP_TEMPLATE_LOCALE },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: otp },
                { type: 'text', text: WHATSAPP_LOGIN_PRODUCT_NAME },
                { type: 'text', text: adminNumber },
              ],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: otp }],
            },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp OTP send failed (${response.status}): ${body}`);
  }
}
