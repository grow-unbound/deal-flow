/** Campaign hero image ratio (1125 × 600 px). */
export const BUYER_LOOKBOOK_ASPECT_CLASS = 'aspect-[15/8]' as const;

/** Default width for lookbook cards in horizontal carousels. */
export const BUYER_LOOKBOOK_CAROUSEL_WIDTH_PX = 280;

/** Compact lookbook cards (Campaigns rail) — narrower, still landscape. */
export const BUYER_LOOKBOOK_COMPACT_CAROUSEL_WIDTH_CLASS = 'w-[188px] sm:w-[208px] lg:w-[228px]' as const;
export const BUYER_LOOKBOOK_COMPACT_CAROUSEL_SIZES = '(min-width: 1024px) 228px, (min-width: 640px) 208px, 188px' as const;

/** Default width for product cards in horizontal carousels. */
export const BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS = 'w-[144px] sm:w-[152px] lg:w-[160px]' as const;

/** Compact product cards (cart gap carousel, secondary surfaces). */
export const BUYER_PRODUCT_CAROUSEL_COMPACT_WIDTH_CLASS = 'w-[108px] sm:w-[112px]' as const;
