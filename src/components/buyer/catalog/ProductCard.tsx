'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, Package } from 'lucide-react';
import posthog from 'posthog-js';
import { Pressable } from '@/components/ui/pressable';
import { cn, formatCurrency } from '@/lib/utils';
import { BUYER_CARD_RADIUS_CLASS, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';
import { useCart } from '@/contexts/BuyerCartContext';
import { useRecoWidget } from '@/contexts/RecoWidgetContext';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import type { BuyerCatalogItem } from '@/types/buyer';

interface ProductCardProps {
  item: BuyerCatalogItem;
  className?: string;
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

export function ProductCard({ item, className }: ProductCardProps): React.ReactNode {
  const { items, addItem, updateQty } = useCart();
  const recoCtx = useRecoWidget();
  const [productImgError, setProductImgError] = React.useState(false);
  const [brandImgError, setBrandImgError] = React.useState(false);
  const [categoryImgError, setCategoryImgError] = React.useState(false);

  const cartItem = items.find((i) => i.tenant_product_id === item.tenant_product_id);
  const isOos = item.stock_status === 'out_of_stock';
  const productHref = `/buy/product/${item.tenant_product_id}`;

  const productImg = !productImgError && item.image_urls.length > 0 ? item.image_urls[0] : null;
  const brandImg = productImgError && !brandImgError && item.brand_logo_url ? item.brand_logo_url : null;
  const categoryImg = productImgError && brandImgError && !categoryImgError && item.category_image_url ? item.category_image_url : null;
  const activeImg = productImg ?? brandImg ?? categoryImg;

  function handleQuickAdd(e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (isOos) return;
    addItem({
      tenant_product_id: item.tenant_product_id,
      name: item.display_name,
      brand: item.brand_name ?? undefined,
      internal_sku: item.internal_sku,
      image_url: item.image_urls[0],
      unit_price: item.price,
      gst_rate: item.gst_rate ?? null,
      unit: item.default_uom ?? undefined,
      quantity: 1,
      line_total: item.price,
      tenant_category_id: item.category_id ?? undefined,
      stock_status: item.stock_status,
      on_hand: item.on_hand,
    }, item.campaign_id);
    if (recoCtx) {
      posthog.capture('reco_add_to_cart', {
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
        'shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]',
        'transition-all hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(34,30,26,0.08),0_2px_6px_rgba(34,30,26,0.05)]',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex aspect-square items-center justify-center overflow-hidden bg-[var(--bg-surface)]',
          isOos && 'opacity-80 saturate-[0.85]',
        )}
      >
        <Pressable asChild haptic>
          <Link
            href={productHref}
            onClick={() => markBuyerNavigationForward()}
            className="absolute inset-0 flex items-center justify-center no-underline"
            aria-label={item.display_name}
          >
            {item.is_featured ? (
              <span className="absolute left-2 top-2 z-[1] rounded bg-[var(--teal-500)] px-2 py-0.5 font-bold uppercase tracking-wide text-white" style={{ fontSize: 'var(--b-text-eyebrow)' }}>
                New
              </span>
            ) : null}
            {item.stock_status === 'limited' || item.stock_status === 'out_of_stock' ? (
              <ProductStockCornerBadge status={item.stock_status} />
            ) : null}
            {activeImg ? (
              <>
                {productImg ? (
                  <Image
                    src={productImg}
                    alt=""
                    fill
                    className="object-contain p-3.5"
                    sizes="(max-width: 640px) 50vw, 200px"
                    onError={() => setProductImgError(true)}
                    unoptimized
                  />
                ) : brandImg ? (
                  <Image
                    src={brandImg}
                    alt=""
                    fill
                    className="object-contain p-3.5"
                    sizes="(max-width: 640px) 50vw, 200px"
                    onError={() => setBrandImgError(true)}
                    unoptimized
                  />
                ) : categoryImg ? (
                  <Image
                    src={categoryImg}
                    alt=""
                    fill
                    className="object-contain p-3.5"
                    sizes="(max-width: 640px) 50vw, 200px"
                    onError={() => setCategoryImgError(true)}
                    unoptimized
                  />
                ) : null}
              </>
            ) : (
              <Package className="h-10 w-10 text-[var(--fg-3)]" />
            )}
          </Link>
        </Pressable>

        {cartItem ? (
          <div className="absolute bottom-2 right-2 z-[2] flex h-9 items-center overflow-hidden rounded-lg bg-[#1C1C1E] shadow-md">
            <button
              type="button"
              onClick={handleDecrement}
              className="flex h-9 w-8 items-center justify-center text-white active:opacity-70"
              aria-label="Decrease quantity"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums text-white">
              {cartItem.quantity}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              className="flex h-9 w-8 items-center justify-center text-white active:opacity-70"
              aria-label="Increase quantity"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isOos}
            onClick={handleQuickAdd}
            className={cn(
              'absolute bottom-2 right-2 z-[2] flex h-8 w-8 items-center justify-center rounded-md bg-[#1C1C1E] text-white shadow-md',
              'active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
            )}
            aria-label="Add to cart"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      <Pressable asChild haptic>
        <Link
          href={productHref}
          onClick={() => markBuyerNavigationForward()}
          className="flex flex-1 flex-col no-underline"
        >
          <div className="flex h-full flex-1 flex-col bg-[var(--cream-50)] px-3 pb-3 pt-2.5">
            <p
              className={cn(BUYER_TWO_LINE_TITLE_CLASS, 'font-medium text-[var(--fg-1)]')}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--b-text-body)',
                fontWeight: 500,
                letterSpacing: '-0.005em',
              }}
            >
              {item.display_name}
            </p>
            <p className="mt-0.5 truncate text-[var(--cream-700)]" style={{ fontSize: 'var(--b-text-sub)' }}>
              {item.internal_sku}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span
                className="font-medium tabular-nums text-[var(--fg-1)]"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--b-text-price)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                }}
              >
                {formatCurrency(item.price)}
              </span>
              {item.has_campaign_price && item.resolved_price != null ? (
                <span className="text-xs line-through text-[var(--fg-3)]">
                  {formatCurrency(item.resolved_price)}
                </span>
              ) : null}
            </div>
            {item.has_campaign_price && item.campaign_valid_until ? (
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
