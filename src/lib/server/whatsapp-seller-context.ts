import { isValidIndianMobile, normalizeIndianPhone } from '@/lib/phone';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export interface SellerContext {
  sellerName: string;
  sellerPhone: string;
}

export function buildSellerContextFromTenant(tenant: {
  business_name?: string | null;
  settings?: unknown;
} | null | undefined): SellerContext {
  const settings = asRecord(tenant?.settings);
  const businessSettings = asRecord(settings.business);
  const buyerAppSettings = asRecord(settings.buyer_app);

  return {
    sellerName:
      readString(buyerAppSettings, 'whatsapp_display_name')
      ?? readString(businessSettings, 'company_name')
      ?? tenant?.business_name?.trim()
      ?? 'Your business',
    sellerPhone: normalizeIndianPhone(
      readString(buyerAppSettings, 'whatsapp_number')
      ?? readString(businessSettings, 'phone')
      ?? process.env.WHATSAPP_ADMIN_NUMBER
      ?? '',
    ),
  };
}

export function formatSellerPhoneDisplay(phone: string): string {
  const normalized = normalizeIndianPhone(phone);
  if (!normalized || !isValidIndianMobile(normalized)) {
    return phone.trim() || 'Your business number';
  }
  return `+91 ${normalized.slice(0, 5)} ${normalized.slice(5)}`;
}

export const CAMPAIGN_ANNOUNCEMENT_TEMPLATE_META = {
  footer_text: 'Powered by Yukti',
  buttons: [
    { label: 'View campaign', type: 'url' as const },
    { label: 'Enquire now', type: 'url' as const },
    { label: 'Unsubscribe', type: 'quick_reply' as const },
  ],
};
