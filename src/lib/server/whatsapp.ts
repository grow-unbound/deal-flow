import { formatWhatsappDestination } from '@/lib/phone';

const WHATSAPP_TEMPLATE_NAME = 'login_otp';
const WHATSAPP_TEMPLATE_LOCALE = 'en_US';
const WHATSAPP_LOGIN_PRODUCT_NAME = 'Login to Yukti';

export async function sendLoginOtpWhatsapp(phone: string, otp: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID;
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
          name: WHATSAPP_TEMPLATE_NAME,
          language: {
            code: WHATSAPP_TEMPLATE_LOCALE,
          },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: otp },
                { type: 'text', text: WHATSAPP_LOGIN_PRODUCT_NAME },
                { type: 'text', text: adminNumber },
              ],
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
