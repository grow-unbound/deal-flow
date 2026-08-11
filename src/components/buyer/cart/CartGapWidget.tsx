'use client';

import * as React from 'react';
import Image from 'next/image';
import { Package, Plus, Sparkles } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { ProductCard } from '@/components/buyer/catalog/ProductCard';
import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { RecoWidgetProvider } from '@/contexts/RecoWidgetContext';
import { useCart, type BuyerCartItem } from '@/contexts/BuyerCartContext';
import { useBuyerAnalyticsIds } from '@/lib/analytics-identity';
import type { CartBundle } from '@/hooks/useCartBundles';
import { BUYER_PRODUCT_CAROUSEL_COMPACT_WIDTH_CLASS } from '@/lib/buyer-lookbook';
import {
  getBuyerProductPrimaryImageUrl,
  hasBuyerCampaignPrice,
} from '@/lib/buyer-ui';
import { cn, formatNumberValue } from '@/lib/utils';
import {
  buildCartGapRecommendations,
  type CartGapRecommendation,
} from '@/lib/cart-gap-recommendations';
import type { BuyerCatalogItem } from '@/types/buyer';

interface CartGapWidgetProps {
  bundles: CartBundle[];
  items: BuyerCartItem[];
  tenantId: string;
}

/** Carousel only when there are more than this many recommendations. */
const CART_GAP_CAROUSEL_MIN_COUNT = 5;

export function CartGapWidget({ bundles, items, tenantId }: CartGapWidgetProps) {
  const posthog = usePostHog();
  const { buyer_id } = useBuyerAnalyticsIds();
  const recommendations = buildCartGapRecommendations(bundles, items);
  const shownRef = React.useRef(false);
  const useCarousel = recommendations.length >= CART_GAP_CAROUSEL_MIN_COUNT;

  React.useEffect(() => {
    if (recommendations.length === 0 || shownRef.current) return;
    shownRef.current = true;
    posthog?.capture('reco_widget_shown', {
      widget: 'cart_gap',
      tenant_id: tenantId,
      buyer_id,
      result_count: recommendations.length,
      layout: useCarousel ? 'carousel' : 'list',
    });
  }, [posthog, recommendations.length, tenantId, buyer_id, useCarousel]);

  if (recommendations.length === 0) return null;

  return (
    <div
      className="rounded-[12px] overflow-hidden"
      style={{ border: '1px solid var(--teal-100, #ccfbf1)', background: 'var(--teal-50, #f0fdfa)' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--teal-100, #ccfbf1)' }}
      >
        <Sparkles className="h-3 w-3 shrink-0" style={{ color: 'var(--teal-500)' }} />
        <p
          className="min-w-0 flex-1 font-semibold"
          style={{ fontSize: 'var(--b-text-sub)', color: 'var(--teal-800, #134e4a)' }}
        >
          You might be missing
        </p>
      </div>

      <RecoWidgetProvider value={{ widget: 'cart_gap' }}>
        {useCarousel ? (
          <BuyerHorizontalScroll className="gap-2 px-3 py-2 items-stretch">
            {recommendations.map(({ product, tenantCategoryId }) => {
              const catalogItem: BuyerCatalogItem = {
                ...product,
                category_id: product.category_id ?? tenantCategoryId,
              };

              return (
                <ProductCard
                  key={tenantCategoryId}
                  item={catalogItem}
                  variant="compact"
                  showPromotionBadge={false}
                  className={cn(BUYER_PRODUCT_CAROUSEL_COMPACT_WIDTH_CLASS, 'shrink-0')}
                />
              );
            })}
          </BuyerHorizontalScroll>
        ) : (
          <div>
            {recommendations.map((rec, index) => (
              <CartGapListItem
                key={rec.tenantCategoryId}
                recommendation={rec}
                tenantId={tenantId}
                showDivider={index > 0}
              />
            ))}
          </div>
        )}
      </RecoWidgetProvider>
    </div>
  );
}

function CartGapListItem({
  recommendation,
  tenantId,
  showDivider,
}: {
  recommendation: CartGapRecommendation;
  tenantId: string;
  showDivider: boolean;
}) {
  const posthog = usePostHog();
  const { buyer_id } = useBuyerAnalyticsIds();
  const { addItem } = useCart();
  const { product, bundleName, tenantCategoryId, slotLabel } = recommendation;
  const imageUrl = getBuyerProductPrimaryImageUrl(product);
  const showCampaignPrice = hasBuyerCampaignPrice(product);
  const slotCategory = slotLabel ?? tenantCategoryId;
  const subline = [product.brand_name, product.internal_sku].filter(Boolean).join(' · ');

  function handleAdd(): void {
    addItem(
      {
        tenant_product_id: product.tenant_product_id,
        name: product.display_name,
        brand: product.brand_name ?? undefined,
        internal_sku: product.internal_sku,
        image_url: imageUrl ?? undefined,
        unit_price: product.price,
        resolved_price: product.resolved_price,
        has_campaign_price: product.has_campaign_price,
        gst_rate: product.gst_rate ?? null,
        unit: product.default_uom ?? undefined,
        quantity: 1,
        line_total: product.price,
        tenant_category_id: product.category_id ?? tenantCategoryId,
        stock_status: product.stock_status,
        on_hand: product.on_hand,
      },
      product.campaign_id,
      {
        source_surface: 'cart_gap_widget',
        source_widget: 'cart_gap',
      },
    );
    posthog?.capture('reco_add_to_cart', {
      widget: 'cart_gap',
      product_id: product.tenant_product_id,
      tenant_id: tenantId,
      buyer_id,
    });
    posthog?.capture('reco_cart_gap_add', {
      bundle_name: bundleName,
      slot_category: slotCategory,
      added_product_id: product.tenant_product_id,
      tenant_id: tenantId,
      buyer_id,
    });
  }

  return (
    <>
      {showDivider ? (
        <div style={{ borderTop: '1px solid var(--teal-100, #ccfbf1)' }} />
      ) : null}
      <div className="flex gap-3 px-4 py-3">
        <div
          className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg"
          style={{ width: 56, height: 56, background: 'var(--teal-100, #ccfbf1)' }}
        >
          {imageUrl ? (
            <Image src={imageUrl} alt={product.display_name} fill className="object-cover" sizes="56px" unoptimized />
          ) : (
            <Package className="h-6 w-6" style={{ color: 'var(--teal-400)' }} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {slotLabel ? (
            <p
              className="mb-0.5 truncate uppercase"
              style={{
                fontSize: 'var(--b-text-eyebrow)',
                letterSpacing: '0.12em',
                color: 'var(--teal-600, #0d9488)',
              }}
            >
              {slotLabel}
            </p>
          ) : null}
          <p
            className="truncate font-semibold leading-snug"
            style={{ fontSize: 'var(--b-text-label)', color: 'var(--teal-900, #042f2e)' }}
          >
            {product.display_name}
          </p>
          {subline ? (
            <p className="mt-0.5 truncate" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--teal-700, #0f766e)' }}>
              {subline}
            </p>
          ) : null}
          <div
            className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1"
            style={{ color: 'var(--teal-700, #0f766e)' }}
          >
            <span className="tabular-nums" style={{ fontSize: 'var(--b-text-sub)', fontFamily: 'var(--font-mono)' }}>
              {formatNumberValue(product.price, 'CURRENCY_EXACT')}
              {product.default_uom ? ` / ${product.default_uom}` : ''}
            </span>
            {showCampaignPrice ? (
              <span
                className="tabular-nums line-through"
                style={{ fontSize: 'var(--b-text-eyebrow)', fontFamily: 'var(--font-mono)' }}
              >
                {formatNumberValue(product.resolved_price, 'CURRENCY_EXACT')}
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-lg"
          style={{ background: 'var(--teal-500)', color: '#fff' }}
          aria-label={`Add ${product.display_name} to cart`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
