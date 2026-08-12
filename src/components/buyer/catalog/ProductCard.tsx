'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, Package } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { Pressable } from '@/components/ui/pressable';
import { cn, formatNumberValue } from '@/lib/utils';
import {
  BUYER_CARD_RADIUS_CLASS,
  BUYER_TWO_LINE_TITLE_CLASS,
  getBuyerProductPrimaryImageUrl,
  hasBuyerCampaignPrice,
} from '@/lib/buyer-ui';
import { useCart } from '@/contexts/BuyerCartContext';
import { useBuyerMe } from '@/hooks/useBuyerMe';
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

interface ProductCardProps {
  item: BuyerCatalogItem;
  className?: string;
  showPromotionBadge?: boolean;
  /** Smaller tile for secondary surfaces (e.g. cart gap carousel). */
  variant?: 'default' | 'compact';
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
      className="absolute left-2 top-2 z-[1] rounded-full border border-[#F97316] bg-[#FFF1E8] px-2.5 py-1 font-extrabold uppercase tracking-[0.12em] text-[#C2410C] shadow-[0_6px_14px_rgba(249,115,22,0.22)]"
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
  const stockVisible = meData?.stock_visibility?.enabled ?? false;
  const recoCtx = useRecoWidget();
  const [productImgError, setProductImgError] = React.useState(false);
  const [brandImgError, setBrandImgError] = React.useState(false);
  const [categoryImgError, setCategoryImgError] = React.useState(false);

  const cartItem = items.find((i) => i.tenant_product_id === item.tenant_product_id);
  const isOos = item.stock_status === 'out_of_stock';
  const productHref = `/buy/product/${item.tenant_product_id}`;
  const showCampaignPrice = hasBuyerCampaignPrice(item);
  const prefetchProduct = prefetchOnPress(productHref, () => {
    prefetchBuyerProductDetail(queryClient, item.tenant_product_id, stockSignature);
  });

  const productImg = !productImgError && item.image_urls.length > 0 ? item.image_urls[0] : null;
  const categoryImg = !productImg && !categoryImgError && item.category_image_url ? item.category_image_url : null;
  const brandImg = !productImg && !categoryImg && !brandImgError && item.brand_logo_url ? item.brand_logo_url : null;
  const activeImg = productImg ?? categoryImg ?? brandImg;

  function handleQuickAdd(e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      tenant_product_id: item.tenant_product_id,
      name: item.display_name,
      brand: item.brand_name ?? undefined,
      internal_sku: item.internal_sku,
      image_url: getBuyerProductPrimaryImageUrl(item) ?? undefined,
      unit_price: item.price,
      resolved_price: item.resolved_price,
      has_campaign_price: item.has_campaign_price,
      gst_rate: item.gst_rate ?? null,
      unit: item.default_uom ?? undefined,
      quantity: 1,
      line_total: item.price,
      tenant_category_id: item.category_id ?? undefined,
      stock_status: item.stock_status,
      on_hand: item.on_hand,
    }, item.campaign_id, {
      source_surface: recoCtx ? 'recommendation_card' : 'catalog_product_card',
      source_widget: recoCtx?.widget ?? null,
      source_product_id: recoCtx?.sourceProductId ?? null,
    });
    if (recoCtx) {
      posthog?.capture('reco_add_to_cart', {
        ...analyticsIds,
        widget: recoCtx.widget,
        product_id: item.tenant_product_id,
        source_product_id: recoCtx.sourceProductId ?? null,
      });
    }
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
        'relative flex h-full flex-col overflow-hidden border border-[var(--border-1)] bg-[var(--bg-surface)]',
        isCompact
          ? 'shadow-[0_1px_2px_rgba(34,30,26,0.05)]'
          : 'shadow-[0_1px_3px_rgba(34,30,26,0.06),0_3px_10px_rgba(34,30,26,0.05)] transition-all hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(34,30,26,0.08),0_2px_6px_rgba(34,30,26,0.05)]',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex aspect-square items-center justify-center overflow-hidden bg-[var(--bg-surface)]',
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
                {productImg ? (
                  <Image
                    src={productImg}
                    alt=""
                    fill
                    className={cn('object-contain', isCompact ? 'p-1.5' : 'p-2.5 sm:p-3')}
                    sizes={isCompact ? '118px' : '(max-width: 639px) 41vw, (max-width: 1023px) 28vw, (max-width: 1379px) 18vw, 14vw'}
                    onError={() => setProductImgError(true)}
                    unoptimized
                  />
                ) : categoryImg ? (
                  <Image
                    src={categoryImg}
                    alt=""
                    fill
                    className={cn('object-contain', isCompact ? 'p-1.5' : 'p-2.5 sm:p-3')}
                    sizes={isCompact ? '118px' : '(max-width: 639px) 41vw, (max-width: 1023px) 28vw, (max-width: 1379px) 18vw, 14vw'}
                    onError={() => setCategoryImgError(true)}
                    unoptimized
                  />
                ) : brandImg ? (
                  <Image
                    src={brandImg}
                    alt=""
                    fill
                    className={cn('object-contain', isCompact ? 'p-1.5' : 'p-2.5 sm:p-3')}
                    sizes={isCompact ? '118px' : '(max-width: 639px) 41vw, (max-width: 1023px) 28vw, (max-width: 1379px) 18vw, 14vw'}
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
              'absolute bottom-1.5 right-1.5 z-[2] flex items-center overflow-hidden rounded-md bg-[#1C1C1E] shadow-md',
              isCompact ? 'h-7' : 'h-8 bottom-1.5 right-1.5 rounded-lg sm:h-9 sm:bottom-2 sm:right-2',
            )}
          >
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
            <span
              className={cn(
                'min-w-[1.25rem] text-center font-semibold tabular-nums text-white',
                isCompact ? 'text-xs' : 'min-w-[1.25rem] text-xs sm:min-w-[1.5rem] sm:text-sm',
              )}
            >
              {cartItem.quantity}
            </span>
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
          </div>
        ) : (
          <button
            type="button"
            onClick={handleQuickAdd}
            className={cn(
              'absolute z-[2] flex items-center justify-center rounded-md bg-[#1C1C1E] text-white shadow-md',
              'active:scale-95',
              isCompact ? 'bottom-1.5 right-1.5 h-6 w-6' : 'bottom-1.5 right-1.5 h-7 w-7 sm:bottom-2 sm:right-2 sm:h-8 sm:w-8',
            )}
            aria-label="Add to cart"
          >
            <Plus className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
          </button>
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
              'flex h-full flex-1 flex-col bg-[var(--cream-50)]',
              isCompact ? 'px-2 pb-2 pt-1.5' : 'px-2.5 pb-2.5 pt-2 sm:px-3 sm:pb-3 sm:pt-2.5',
            )}
          >
            <p
              className={cn(BUYER_TWO_LINE_TITLE_CLASS, 'font-medium text-[var(--fg-1)]')}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: isCompact ? 'var(--b-text-label)' : 'clamp(13px, 1.5vw, var(--b-text-body))',
                fontWeight: 500,
                letterSpacing: '-0.005em',
              }}
            >
              {item.display_name}
            </p>
            {!isCompact ? (
              <p className="mt-0.5 truncate text-[var(--cream-700)]" style={{ fontSize: '11px' }}>
                {item.internal_sku}
              </p>
            ) : null}
            <div className={cn('flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5', isCompact ? 'mt-1' : 'mt-2')}>
              <span
                className="font-medium tabular-nums text-[var(--fg-1)]"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: isCompact ? 'var(--b-text-sub)' : 'clamp(15px, 1.9vw, var(--b-text-price))',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                }}
              >
                {formatNumberValue(item.price, 'CURRENCY_EXACT')}
              </span>
              {showCampaignPrice ? (
                <span className={cn('line-through text-[var(--fg-3)]', isCompact ? 'text-[10px]' : 'text-xs')}>
                  {formatNumberValue(item.resolved_price, 'CURRENCY_EXACT')}
                </span>
              ) : null}
            </div>
            {!isCompact && item.has_campaign_price && item.campaign_valid_until ? (
              <p className="mt-1 text-[11px] text-amber-700">
                Valid until {new Date(item.campaign_valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </p>
            ) : null}
          </div>
        </Link>
      </Pressable>
    </div>
  );
}
