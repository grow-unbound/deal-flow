/** Standard corner radius for buyer app cards — matches ActivityCardShell / estimate list rows. */
export const BUYER_CARD_RADIUS_CLASS = 'rounded-[12px]' as const;

/** Reserve space for two lines of product/campaign title at --b-text-body + leading 1.2. */
export const BUYER_TWO_LINE_TITLE_CLASS =
  'line-clamp-2 min-h-[2.4em] leading-[1.2]' as const;

/** Prefetch next page when the user scrolls past this fraction of the loaded list. */
export const BUYER_INFINITE_SCROLL_RATIO = 0.7 as const;

export function formatBuyerCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export function hasBuyerCampaignPrice(input: {
  has_campaign_price?: boolean;
  price: number;
  resolved_price?: number | null;
}): boolean {
  return Boolean(
    input.has_campaign_price
    && input.resolved_price != null
    && Math.abs(input.resolved_price - input.price) > 0.004,
  );
}
