/** Standard corner radius for buyer app cards — matches ActivityCardShell / estimate list rows. */
export const BUYER_CARD_RADIUS_CLASS = 'rounded-[12px]' as const;

/** Reserve space for two lines of product/campaign title at --b-text-body + leading 1.2. */
export const BUYER_TWO_LINE_TITLE_CLASS =
  'line-clamp-2 min-h-[2.4em] leading-[1.2]' as const;

/** Shared responsive density for buyer catalog/product grids. */
export const BUYER_PRODUCT_GRID_CLASS =
  'grid grid-cols-2 gap-x-2.5 gap-y-1.5 px-1.5 pb-3 md:grid-cols-3 md:gap-x-3 md:gap-y-2 md:px-2 lg:grid-cols-4 min-[1240px]:grid-cols-5 min-[1380px]:grid-cols-6' as const;

/** Shared split layout for buyer category/brand/list detail pages with a master-list rail.
 * The base rail width clamps down on sub-400px phones so the product cards retain usable width. */
export const BUYER_DETAIL_RAIL_GRID_CLASS =
  'grid items-start grid-cols-[clamp(64px,19vw,84px)_minmax(0,1fr)] gap-2 px-1.5 pb-4 sm:grid-cols-[108px_minmax(0,1fr)] sm:gap-4 sm:px-3 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:px-4 lg:pb-6' as const;

/** Shared rail item density for buyer category/brand detail pages. */
export const BUYER_DETAIL_RAIL_ITEM_CLASS =
  'flex min-h-[72px] flex-col items-center justify-center gap-1.5 px-0.5 py-2 sm:min-h-[96px] sm:gap-2 sm:px-2 sm:py-3 lg:min-h-[76px] lg:flex-row lg:items-center lg:justify-start lg:gap-3 lg:px-1 lg:py-3' as const;

/** Shared thumbnail size for buyer category/brand detail rails. */
export const BUYER_DETAIL_RAIL_THUMB_CLASS =
  'h-10 w-10 p-1 sm:h-14 sm:w-14 sm:p-1.5 lg:h-16 lg:w-16 lg:p-2' as const;

/** Shared two-line label density for buyer category/brand detail rails. */
export const BUYER_DETAIL_RAIL_LABEL_CLASS =
  'line-clamp-2 text-center text-[10px] font-medium leading-tight sm:text-[11px] lg:text-left lg:text-[var(--b-text-label)]' as const;

/** Category tile grid — fixed 3-column density on mobile (auto-fill's 180px floor is too
 * coarse below md, it collapses to 1 column); at md+ switches to auto-fill so tiles stretch
 * to fill available width instead of leaving a dead gutter at wide viewports. Pair with a
 * centered max-width wrapper on ultrawide screens. */
export const BUYER_GRID_AUTOFILL_CLASS =
  'grid grid-cols-3 gap-x-3 gap-y-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-x-3.5 md:gap-y-2.5' as const;

/** Prefetch next page when the user scrolls past this fraction of the loaded list. */
export const BUYER_INFINITE_SCROLL_RATIO = 0.75 as const;

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
  '[@media(hover:hover)]:hover:bg-[var(--bg-surface)] [@media(hover:hover)]:hover:border-[var(--border-2)] [@media(hover:hover)]:hover:shadow-[0_8px_22px_rgba(34,30,26,0.10)] focus-visible:bg-[var(--bg-surface)] focus-visible:border-[var(--border-2)] focus-visible:shadow-[0_8px_22px_rgba(34,30,26,0.10)] has-[:focus-visible]:bg-[var(--bg-surface)] has-[:focus-visible]:border-[var(--border-2)] has-[:focus-visible]:shadow-[0_8px_22px_rgba(34,30,26,0.10)]' as const;

type BuyerProductImageLike = {
  image_urls?: string[] | null;
  category_image_url?: string | null;
  brand_logo_url?: string | null;
};

type BuyerCatalogItemLike = {
  item_type?: 'sku' | 'family';
  id: string;
  tenant_product_id: string;
  display_name: string;
  brand_id?: string | null;
  category_id?: string | null;
};

export function dedupeBuyerCatalogItems<T extends BuyerCatalogItemLike>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.item_type === 'family'
      ? ['family', item.brand_id ?? '', item.category_id ?? '', item.display_name.trim().toLowerCase()].join(':')
      : `sku:${item.tenant_product_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

export function hasVisibleBuyerPrice(price: number | null | undefined): price is number {
  return typeof price === 'number' && Number.isFinite(price);
}

export function isHiddenPriceEnquiryMode(
  mode: 'hidden_until_login' | 'hide_price_collect_enquiry' | 'base_selling_rate' | 'assigned_price_list' | '' | null | undefined,
): boolean {
  return mode === 'hide_price_collect_enquiry';
}

/**
 * Maps a tenant's public-catalog pricing mode to how ProductCard should
 * render price for a guest: hidden_until_login shows a clickable "Login for
 * Price" CTA (not just an inert grey bar) since that's the mode where a
 * guest can actually do something about it. Shared between the real guest
 * storefront and the seller's own onboarding preview, which must render
 * identically.
 */
export function guestPriceReveal(
  mode: 'hidden_until_login' | 'hide_price_collect_enquiry' | 'base_selling_rate' | 'assigned_price_list' | '' | null | undefined,
): 'hidden_bar' | 'login_cta' | 'amount' {
  if (mode === 'hidden_until_login') return 'login_cta';
  if (mode === 'hide_price_collect_enquiry') return 'hidden_bar';
  if (mode === 'base_selling_rate' || mode === 'assigned_price_list') return 'amount';
  return 'hidden_bar';
}

export function hasBuyerCampaignPrice(input: {
  has_campaign_price?: boolean;
  price: number | null;
  resolved_price?: number | null;
}): boolean {
  if (!hasVisibleBuyerPrice(input.price) || input.resolved_price == null) return false;
  return Boolean(
    input.has_campaign_price
    && Math.abs(input.resolved_price - input.price) > 0.004,
  );
}
