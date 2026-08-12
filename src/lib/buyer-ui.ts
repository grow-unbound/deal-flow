/** Standard corner radius for buyer app cards — matches ActivityCardShell / estimate list rows. */
export const BUYER_CARD_RADIUS_CLASS = 'rounded-[12px]' as const;

/** Reserve space for two lines of product/campaign title at --b-text-body + leading 1.2. */
export const BUYER_TWO_LINE_TITLE_CLASS =
  'line-clamp-2 min-h-[2.4em] leading-[1.2]' as const;

/** Shared responsive density for buyer catalog/product grids. */
export const BUYER_PRODUCT_GRID_CLASS =
  'grid grid-cols-2 gap-1.5 px-1.5 pb-3 md:grid-cols-3 md:gap-2 md:px-2 lg:grid-cols-4 min-[1240px]:grid-cols-5 min-[1380px]:grid-cols-6' as const;

/** Shared responsive density for buyer discovery/category tiles. */
export const BUYER_DISCOVERY_GRID_CLASS =
  'grid grid-cols-3 gap-2 md:grid-cols-4 min-[1380px]:grid-cols-5' as const;

/** Prefetch next page when the user scrolls past this fraction of the loaded list. */
export const BUYER_INFINITE_SCROLL_RATIO = 0.7 as const;

type BuyerProductImageLike = {
  image_urls?: string[] | null;
  category_image_url?: string | null;
  brand_logo_url?: string | null;
};

export function getBuyerProductImageCandidates(input: BuyerProductImageLike): string[] {
  const productImage = input.image_urls?.find((url) => typeof url === 'string' && url.trim().length > 0)?.trim() ?? null;
  const categoryImage = typeof input.category_image_url === 'string' && input.category_image_url.trim().length > 0
    ? input.category_image_url.trim()
    : null;
  const brandImage = typeof input.brand_logo_url === 'string' && input.brand_logo_url.trim().length > 0
    ? input.brand_logo_url.trim()
    : null;

  return [productImage, categoryImage, brandImage].filter((url, index, arr): url is string => Boolean(url) && arr.indexOf(url) === index);
}

export function getBuyerProductPrimaryImageUrl(input: BuyerProductImageLike): string | null {
  return getBuyerProductImageCandidates(input)[0] ?? null;
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
