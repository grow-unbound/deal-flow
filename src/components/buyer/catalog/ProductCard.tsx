'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, Package } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { Pressable } from '@/components/ui/pressable';
import { cn, formatNumberValue } from '@/lib/utils';
import {
  BUYER_CARD_COMPACT_IMAGE_PX,
  BUYER_CARD_IMAGE_SIZES,
  BUYER_CARD_RADIUS_CLASS,
  BUYER_QUICK_ADD_BUTTON_CLASS,
  BUYER_QUICK_ADD_IDLE_CLASS,
  BUYER_TILE_FRAME_CLASS,
  BUYER_TILE_HOVER_CLASS,
  BUYER_TWO_LINE_TITLE_CLASS,
  getBuyerProductPrimaryImageUrl,
  hasBuyerCampaignPrice,
} from '@/lib/buyer-ui';
import { useCart } from '@/contexts/BuyerCartContext';
import { useStorefrontLogin } from '@/contexts/StorefrontLoginContext';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { STOREFRONT } from '@/lib/storefront-paths';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import { useRecoWidget } from '@/contexts/RecoWidgetContext';
import { useBuyerAnalyticsIds } from '@/lib/analytics-identity';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { usePointerPrefetch } from '@/hooks/usePointerPrefetch';
import {
  buyerDeliveryStockSignature,
  prefetchBuyerProductDetail,
} from '@/hooks/useBuyerProducts';
import { useQueryClient } from '@tanstack/react-query';
import type { BuyerCatalogItem } from '@/types/buyer';

export type ProductCardPriceReveal = 'hidden_bar' | 'login_cta' | 'amount';

interface ProductCardProps {
  item: BuyerCatalogItem;
  className?: string;
  showPromotionBadge?: boolean;
  /** Smaller tile for secondary surfaces (e.g. cart gap carousel). */
  variant?: 'default' | 'compact';
  /** Onboarding preview only — overrides guest price rendering. */
  priceReveal?: ProductCardPriceReveal;
}

function ProductStockCornerBadge({ status }: { status: 'limited' | 'out_of_stock' }): React.ReactNode {
  const isLimited = status === 'limited';
  return (
    <span
      className={cn(
        'absolute right-2 top-2 z-[1] rounded-full border px-2 py-0.5 font-semibold uppercase tracking-[0.08em]',
        isLimited
          ? 'border-[var(--warning-50)] bg-[var(--warning-50)] text-[var(--warning-500)]'
          : 'border-[var(--danger-50)] bg-[var(--danger-50)] text-[var(--danger-500)]',
      )}
      style={{ fontSize: 'var(--b-text-eyebrow)' }}
    >
      {isLimited ? 'Low stock' : 'Out of stock'}
    </span>
  );
}

function ProductPromotionBadge(): React.ReactNode {
  return (
    <span
      // Intentional orange promo accent, no equivalent token in globals.css.
      className="absolute left-2 top-2 z-[1] rounded-full border border-[#F97316] bg-[#FFF1E8] px-2.5 py-1 font-extrabold uppercase tracking-[0.12em] text-[#C2410C] shadow-[0_6px_14px_rgba(249,115,22,0.22)]" // token-exempt
      style={{ fontSize: 'var(--b-text-eyebrow)' }}
    >
      Special Price
    </span>
  );
}

export function ProductCard({
  item,
  className,
  showPromotionBadge = true,
  variant = 'default',
  priceReveal,
}: ProductCardProps): React.ReactNode {
  const isCompact = variant === 'compact';
  const posthog = usePostHog();
  const analyticsIds = useBuyerAnalyticsIds();
  const queryClient = useQueryClient();
  const prefetchOnPress = usePointerPrefetch();
  const delivery = useBuyerDeliveryOptional();
  const stockSignature = buyerDeliveryStockSignature(delivery?.selected);
  const { items, addItem, updateQty } = useCart();
  const { data: meData } = useBuyerMe();
  const { openLogin } = useStorefrontLogin();
  const isGuest = meData?.mode !== 'buyer' && meData?.mode !== 'preview';
  const stockVisible = !isGuest && (meData?.stock_visibility?.enabled ?? false);
  const recoCtx = useRecoWidget();
  const [productImgError, setProductImgError] = React.useState(false);
  const [brandImgError, setBrandImgError] = React.useState(false);
  const [categoryImgError, setCategoryImgError] = React.useState(false);

  const cartItem = items.find((i) => i.tenant_product_id === item.tenant_product_id);
  const isOos = item.stock_status === 'out_of_stock';
  const productHref = STOREFRONT.product(item.tenant_product_id);
  const unitPrice = item.price;
  const showCampaignPrice = !isGuest && unitPrice != null && hasBuyerCampaignPrice(item);
  const discountPct = showCampaignPrice && item.resolved_price
    ? Math.round((1 - unitPrice / item.resolved_price) * 100)
    : 0;
  const prefetchProduct = prefetchOnPress(productHref, () => {
    prefetchBuyerProductDetail(queryClient, item.tenant_product_id, stockSignature);
  });

  const productImg = !productImgError && item.image_urls.length > 0 ? item.image_urls[0] : null;
  const productImgSmall = productImg ? (item.image_url_small ?? productImg) : null;
  const productImgMedium = productImg ? (item.image_url_medium ?? productImg) : null;
  const categoryImg = !productImg && !categoryImgError && item.category_image_url ? item.category_image_url : null;
  const brandImg = !productImg && !categoryImg && !brandImgError && item.brand_logo_url ? item.brand_logo_url : null;
  const activeImg = productImg ?? categoryImg ?? brandImg;

  function handleQuickAdd(e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (isGuest || unitPrice == null) {
      openLogin();
      return;
    }
    addItem({
      tenant_product_id: item.tenant_product_id,
      name: item.display_name,
      brand: item.brand_name ?? undefined,
      internal_sku: item.internal_sku,
      image_url: getBuyerProductPrimaryImageUrl(item) ?? undefined,
      unit_price: unitPrice,
      resolved_price: item.resolved_price,
      has_campaign_price: item.has_campaign_price,
      gst_rate: item.gst_rate ?? null,
      unit: item.default_uom ?? undefined,
      quantity: 1,
      line_total: unitPrice,
      tenant_category_id: item.category_id ?? undefined,
      stock_status: item.stock_status,
      on_hand: item.on_hand,
    }, item.campaign_id, {
      source_surface: recoCtx ? 'recommendation_card' : 'catalog_product_card',
      source_widget: recoCtx?.widget ?? null,
      source_product_id: recoCtx?.sourceProductId ?? null,
    });
    // Previously only fired when recoCtx was set, so the main catalog grid's
    // quick-add button -- the highest-volume add-to-cart path in the app --
    // never reached PostHog at all, only the narrow recommendation-card path
    // did. Fire for both, keeping `widget` null for the non-reco case so the
    // distinction is still visible in the data.
    posthog?.capture('reco_add_to_cart', {
      ...analyticsIds,
      widget: recoCtx?.widget ?? null,
      product_id: item.tenant_product_id,
      source_product_id: recoCtx?.sourceProductId ?? null,
    });
  }

  function handleDecrement(e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (!cartItem) return;
    updateQty(item.tenant_product_id, cartItem.quantity - 1);
  }

  function handleIncrement(e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (!cartItem) return;
    updateQty(item.tenant_product_id, cartItem.quantity + 1);
  }

  return (
    <div
      className={cn(
        BUYER_CARD_RADIUS_CLASS,
        BUYER_TILE_FRAME_CLASS,
        BUYER_TILE_HOVER_CLASS,
        'relative flex h-full flex-col transition-colors',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex aspect-square items-center justify-center overflow-hidden p-1',
          stockVisible && isOos && 'opacity-80 saturate-[0.85]',
        )}
      >
        <Pressable asChild haptic>
          <Link
            href={productHref}
            onClick={() => markBuyerNavigationForward()}
            onPointerDown={prefetchProduct}
            onTouchStart={prefetchProduct}
            className="absolute inset-0 flex items-center justify-center no-underline"
            aria-label={item.display_name}
          >
            {item.is_featured ? (
              <span className="absolute left-2 top-2 z-[1] rounded bg-[var(--teal-500)] px-2 py-0.5 font-bold uppercase tracking-wide text-white" style={{ fontSize: 'var(--b-text-eyebrow)' }}>
                New
              </span>
            ) : showPromotionBadge && showCampaignPrice ? (
              <ProductPromotionBadge />
            ) : null}
            {stockVisible && (item.stock_status === 'limited' || item.stock_status === 'out_of_stock') ? (
              <ProductStockCornerBadge status={item.stock_status} />
            ) : null}
            {activeImg ? (
              <>
                {productImg && isCompact ? (
                  <Image
                    src={productImgSmall ?? productImg}
                    alt=""
                    fill
                    className="object-contain p-1.5"
                    sizes={`${BUYER_CARD_COMPACT_IMAGE_PX}px`}
                    onError={() => setProductImgError(true)}
                    unoptimized
                  />
                ) : productImg ? (
                  <>
                    <Image
                      src={productImgSmall ?? productImg}
                      alt=""
                      fill
                      className="object-contain p-2.5 sm:p-3 md:hidden"
                      sizes={BUYER_CARD_IMAGE_SIZES}
                      onError={() => setProductImgError(true)}
                      unoptimized
                    />
                    <Image
                      src={productImgMedium ?? productImg}
                      alt=""
                      fill
                      className="hidden object-contain p-2.5 sm:p-3 md:block"
                      sizes={BUYER_CARD_IMAGE_SIZES}
                      onError={() => setProductImgError(true)}
                      unoptimized
                    />
                  </>
                ) : categoryImg ? (
                  <Image
                    src={categoryImg}
                    alt=""
                    fill
                    className={cn('object-contain', isCompact ? 'p-1.5' : 'p-2.5 sm:p-3')}
                    sizes={isCompact ? `${BUYER_CARD_COMPACT_IMAGE_PX}px` : BUYER_CARD_IMAGE_SIZES}
                    onError={() => setCategoryImgError(true)}
                    unoptimized
                  />
                ) : brandImg ? (
                  <Image
                    src={brandImg}
                    alt=""
                    fill
                    className={cn('object-contain', isCompact ? 'p-1.5' : 'p-2.5 sm:p-3')}
                    sizes={isCompact ? `${BUYER_CARD_COMPACT_IMAGE_PX}px` : BUYER_CARD_IMAGE_SIZES}
                    onError={() => setBrandImgError(true)}
                    unoptimized
                  />
                ) : null}
              </>
            ) : (
              <Package className={cn('text-[var(--fg-3)]', isCompact ? 'h-6 w-6' : 'h-10 w-10')} />
            )}
          </Link>
        </Pressable>

        {cartItem ? (
          <div
            className={cn(
              cn('absolute bottom-1.5 right-1.5 z-[2] flex items-center overflow-hidden rounded-md text-white', BUYER_QUICK_ADD_BUTTON_CLASS),
              isCompact ? 'h-7' : 'h-8 bottom-1.5 right-1.5 rounded-lg sm:h-9 sm:bottom-2 sm:right-2',
            )}
          >
            <Pressable asChild haptic>
              <button
                type="button"
                onClick={handleDecrement}
                className={cn(
                  'flex items-center justify-center text-white active:opacity-70',
                  isCompact ? 'h-7 w-6' : 'h-8 w-7 sm:h-9 sm:w-8',
                )}
                aria-label="Decrease quantity"
              >
                <Minus className={isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
              </button>
            </Pressable>
            <span
              className={cn(
                'min-w-[1.25rem] text-center font-semibold tabular-nums text-white',
                isCompact ? 'text-xs' : 'min-w-[1.25rem] text-xs sm:min-w-[1.5rem] sm:text-sm',
              )}
            >
              {cartItem.quantity}
            </span>
            <Pressable asChild haptic>
              <button
                type="button"
                onClick={handleIncrement}
                className={cn(
                  'flex items-center justify-center text-white active:opacity-70',
                  isCompact ? 'h-7 w-6' : 'h-8 w-7 sm:h-9 sm:w-8',
                )}
                aria-label="Increase quantity"
              >
                <Plus className={isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
              </button>
            </Pressable>
          </div>
        ) : (
          <Pressable asChild haptic>
            <button
              type="button"
              onClick={handleQuickAdd}
              className={cn(
                BUYER_QUICK_ADD_IDLE_CLASS,
                'absolute z-[2] flex items-center justify-center gap-1 rounded-full font-semibold',
                isCompact
                  ? 'bottom-1.5 right-1.5 px-2 py-0.5'
                  : 'bottom-1.5 right-1.5 px-2.5 py-1 sm:bottom-2 sm:right-2',
              )}
              style={{ fontSize: 'var(--b-text-eyebrow)' }}
              aria-label="Add to cart"
            >
              <Plus className="h-3 w-3" />
              ADD
            </button>
          </Pressable>
        )}
      </div>

      <Pressable asChild haptic>
        <Link
          href={productHref}
          onClick={() => markBuyerNavigationForward()}
          onPointerDown={prefetchProduct}
          onTouchStart={prefetchProduct}
          className="flex flex-1 flex-col no-underline"
        >
          <div
            className={cn(
              'flex h-full flex-1 flex-col',
              isCompact ? 'px-2 pb-2 pt-1.5' : 'px-2.5 pb-2.5 pt-2 sm:px-3 sm:pb-3 sm:pt-2.5',
            )}
          >
            <p
              className={cn(BUYER_TWO_LINE_TITLE_CLASS, 'font-medium text-[var(--fg-1)]')}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: isCompact ? 'var(--b-text-label)' : 'clamp(var(--b-text-label), 1.5vw, var(--b-text-body))',
                fontWeight: 500,
                letterSpacing: '-0.005em',
              }}
            >
              {item.display_name}
            </p>
            {!isCompact ? (
              <p className="mt-0.5 truncate text-[var(--cream-700)]" style={{ fontSize: 'var(--b-text-sub)' }}>
                {item.internal_sku}
              </p>
            ) : null}
            <div className={cn('self-start', isCompact ? 'mt-1' : 'mt-2')}>
                {priceReveal === 'hidden_bar' || (!priceReveal && unitPrice == null) ? (
                  <span
                    className={cn(
                      'inline-block rounded-md bg-cream-300',
                      priceReveal === 'hidden_bar' ? 'h-5 w-[6.25rem]' : 'min-h-[1em] min-w-[4.5rem]',
                    )}
                    aria-label="Price hidden"
                  />
                ) : priceReveal === 'login_cta' ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'inline-flex w-fit shrink-0 cursor-pointer items-center whitespace-nowrap rounded-xs border border-cream-300 bg-white px-3 py-1 font-medium text-cream-600',
                      'transition-colors duration-fast',
                      '[@media(hover:hover)]:hover:border-cream-400 [@media(hover:hover)]:hover:bg-cream-50 [@media(hover:hover)]:hover:text-cream-800',
                    )}
                    style={{ fontSize: 'var(--b-text-eyebrow)' }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openLogin();
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      event.stopPropagation();
                      openLogin();
                    }}
                  >
                    Login for Price
                  </span>
                ) : unitPrice == null ? (
                  <span
                    className="inline-block h-5 w-[6.25rem] rounded-md bg-cream-300"
                    aria-label="Price loading"
                  />
                ) : (
                  <span
                    className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-medium tabular-nums text-[var(--fg-1)]"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: isCompact ? 'var(--b-text-sub)' : 'clamp(var(--b-text-body), 1.9vw, var(--b-text-price))',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 500,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {formatNumberValue(unitPrice, 'CURRENCY_EXACT')}
                    {showCampaignPrice ? (
                      <span className="line-through text-[var(--fg-3)]" style={{ fontSize: 'var(--b-text-eyebrow)' }}>
                        {formatNumberValue(item.resolved_price, 'CURRENCY_EXACT')}
                      </span>
                    ) : null}
                    {showCampaignPrice && discountPct > 0 ? (
                      <span
                        className="ml-0.5 rounded-full bg-[var(--success-50)] px-1.5 py-0.5 font-semibold text-[var(--success-700)]"
                        style={{ fontSize: 'var(--b-text-eyebrow)' }}
                      >
                        -{discountPct}%
                      </span>
                    ) : null}
                  </span>
                )}
            </div>
            {!isCompact && showPromotionBadge && item.has_campaign_price && item.campaign_valid_until ? (
              <p className="mt-1 text-amber-700" style={{ fontSize: 'var(--b-text-sub)' }}>
                Valid until {new Date(item.campaign_valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </p>
            ) : null}
          </div>
        </Link>
      </Pressable>
    </div>
  );
}
