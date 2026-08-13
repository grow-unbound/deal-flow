/** Standard corner radius for buyer app cards — matches ActivityCardShell / estimate list rows. */
export const BUYER_CARD_RADIUS_CLASS = 'rounded-[12px]' as const;

/** Reserve space for two lines of product/campaign title at --b-text-body + leading 1.2. */
export const BUYER_TWO_LINE_TITLE_CLASS =
  'line-clamp-2 min-h-[2.4em] leading-[1.2]' as const;

/** Shared responsive density for buyer catalog/product grids. */
export const BUYER_PRODUCT_GRID_CLASS =
  'grid grid-cols-2 gap-1.5 px-1.5 pb-3 md:grid-cols-3 md:gap-2 md:px-2 lg:grid-cols-4 min-[1240px]:grid-cols-5 min-[1380px]:grid-cols-6' as const;

/** Category tile grid — fixed 3-column density on mobile (auto-fill's 180px floor is too
 * coarse below md, it collapses to 1 column); at md+ switches to auto-fill so tiles stretch
 * to fill available width instead of leaving a dead gutter at wide viewports. Pair with a
 * centered max-width wrapper on ultrawide screens. */
export const BUYER_GRID_AUTOFILL_CLASS =
  'grid grid-cols-3 gap-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-2.5' as const;

/** Prefetch next page when the user scrolls past this fraction of the loaded list. */
export const BUYER_INFINITE_SCROLL_RATIO = 0.7 as const;

/** Responsive `sizes` hint for default-variant product card images — matches BUYER_PRODUCT_GRID_CLASS breakpoints. */
export const BUYER_CARD_IMAGE_SIZES =
  '(max-width: 640px) 41vw, (max-width: 1024px) 28vw, (max-width: 1280px) 18vw, 14vw' as const;

/** Fixed image size (px) for the compact/carousel card variant — does not reflow with viewport. */
export const BUYER_CARD_COMPACT_IMAGE_PX = 118 as const;

/** Brand-token quick-add button styling — the "added" filled stepper (cart qty pill). */
export const BUYER_QUICK_ADD_BUTTON_CLASS = 'bg-[var(--bg-brand)] shadow-[var(--shadow-xs)]' as const;

/** Idle-state quick-add button — outline pill, filled on tap-to-add (see BUYER_QUICK_ADD_BUTTON_CLASS). */
export const BUYER_QUICK_ADD_IDLE_CLASS =
  'border border-[var(--teal-500)] bg-[var(--bg-surface)] text-[var(--teal-500)] [@media(hover:hover)]:hover:border-[var(--border-2)]' as const;

/** Unified frame for product/category/brand tiles — normalizes inconsistent tenant photography
 * behind one fixed boundary. Combine with BUYER_CARD_RADIUS_CLASS at call sites. */
export const BUYER_TILE_FRAME_CLASS =
  'overflow-hidden border border-[var(--border-1)] bg-[var(--bg-surface)]' as const;

/** Whole-tile hover/focus treatment — guarded to hover-capable devices only (this project's
 * Tailwind config has no hover-only variant, so bare `hover:` would also fire on touch-and-hold).
 * Covers both structural cases: the frame element itself is focusable (e.g. a `Link` used
 * directly as the tile) via `focus-visible:`, or it wraps a focusable descendant (e.g.
 * ProductCard's outer div wrapping an inner Link/button) via `has-[:focus-visible]:`. */
export const BUYER_TILE_HOVER_CLASS =
  '[@media(hover:hover)]:hover:bg-[var(--bg-recessed)] [@media(hover:hover)]:hover:border-[var(--border-2)] focus-visible:bg-[var(--bg-recessed)] focus-visible:border-[var(--border-2)] has-[:focus-visible]:bg-[var(--bg-recessed)] has-[:focus-visible]:border-[var(--border-2)]' as const;

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
