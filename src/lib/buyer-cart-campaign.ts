export const BUYER_CART_CAMPAIGN_STORAGE_KEY = 'yukti_buyer_cart_campaign';

export function resolveBuyerCartCampaignId(
  campaignId: string | null,
  items: Array<{ campaign_id?: string | null }>,
): string | null {
  if (campaignId) return campaignId;

  const fromItem = items.find((item) => item.campaign_id)?.campaign_id ?? null;
  if (fromItem) return fromItem;

  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(BUYER_CART_CAMPAIGN_STORAGE_KEY);
    return stored && stored !== 'null' ? stored : null;
  } catch {
    return null;
  }
}
