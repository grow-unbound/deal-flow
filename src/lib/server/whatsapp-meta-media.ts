/**
 * Resolve campaign broadcast header images and upload to Meta Cloud API.
 * Fallback chain: campaign hero → tenant logo → platform default.
 */

const GRAPH_API_VERSION = 'v20.0';

export type HeaderImageSource = 'campaign' | 'tenant_logo' | 'platform_default';

export interface ResolvedHeaderImage {
  source: HeaderImageSource;
  imageUrl: string;
}

function getConfig() {
  return {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID,
    platformDefaultUrl:
      process.env.WHATSAPP_DEFAULT_HEADER_IMAGE_URL?.trim()
      ?? 'https://assets.yukti.so/platform/whatsapp-campaign-default.jpg',
  };
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

export async function resolveCampaignHeaderImage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: {
    tenantId: string;
    campaignId?: string | null;
    heroImageUrl?: string | null;
  },
): Promise<ResolvedHeaderImage> {
  if (input.heroImageUrl?.trim()) {
    return { source: 'campaign', imageUrl: input.heroImageUrl.trim() };
  }

  if (input.campaignId) {
    const { data: campaign } = await db
      .schema('app')
      .from('campaigns')
      .select('hero_image_url')
      .eq('id', input.campaignId)
      .eq('tenant_id', input.tenantId)
      .maybeSingle();

    if (campaign?.hero_image_url) {
      return { source: 'campaign', imageUrl: campaign.hero_image_url as string };
    }
  }

  const { data: tenant } = await db
    .schema('app')
    .from('tenants')
    .select('settings')
    .eq('id', input.tenantId)
    .maybeSingle();

  const settings = asRecord(tenant?.settings);
  const business = asRecord(settings.business);
  const logoUrl = readString(business, 'logo_url');
  if (logoUrl) {
    return { source: 'tenant_logo', imageUrl: logoUrl };
  }

  return { source: 'platform_default', imageUrl: getConfig().platformDefaultUrl };
}

export async function uploadHeaderImageToMeta(imageUrl: string): Promise<string> {
  const { token, phoneNumberId } = getConfig();
  if (!token || !phoneNumberId) {
    throw new Error('WhatsApp Cloud API credentials are not configured');
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch header image (${imageRes.status})`);
  }

  const buffer = await imageRes.arrayBuffer();
  const contentType = imageRes.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/jpeg';
  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('type', contentType);
  formData.append('file', new Blob([buffer], { type: contentType }), 'campaign-header.jpg');

  const uploadRes = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  );

  const bodyText = await uploadRes.text();
  if (!uploadRes.ok) {
    throw new Error(`Meta media upload failed (${uploadRes.status}): ${bodyText}`);
  }

  let parsed: { id?: string } | null = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = null;
  }

  if (!parsed?.id) {
    throw new Error('Meta media upload returned no media id');
  }

  return parsed.id;
}
