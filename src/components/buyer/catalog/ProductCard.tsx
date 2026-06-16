'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, Package } from 'lucide-react';
import { Pressable } from '@/components/ui/pressable';
import { cn, formatCurrency } from '@/lib/utils';
import { StockBadge } from './StockBadge';
import { useCart } from '@/contexts/BuyerCartContext';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import type { BuyerCatalogItem } from '@/types/buyer';

interface ProductCardProps {
  item: BuyerCatalogItem;
  className?: string;
}

export function ProductCard({ item, className }: ProductCardProps): React.ReactNode {
  const { items, addItem, updateQty } = useCart();
  const [productImgError, setProductImgError] = React.useState(false);
  const [brandImgError, setBrandImgError] = React.useState(false);
  const [categoryImgError, setCategoryImgError] = React.useState(false);

  const cartItem = items.find((i) => i.tenant_product_id === item.tenant_product_id);
  const isOos = item.stock_status === 'out_of_stock';
  const showMrpLine = item.mrp > 0 && item.mrp > item.price;
  const showStockBadge = item.stock_status === 'limited' || item.stock_status === 'out_of_stock';
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
      unit: item.default_uom ?? undefined,
      quantity: 1,
      line_total: item.price,
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
        'relative flex flex-col overflow-hidden rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface)] shadow-xs transition-all hover:-translate-y-px hover:border-[var(--border-2)] hover:shadow-md',
        isOos && 'opacity-60',
        className,
      )}
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[var(--bg-recessed)]">
        <Pressable asChild haptic>
          <Link
            href={productHref}
            onClick={() => markBuyerNavigationForward()}
            className="absolute inset-0 flex items-center justify-center no-underline"
            aria-label={item.display_name}
          >
            {item.is_featured ? (
              <span className="absolute left-2 top-2 z-[1] rounded bg-[var(--teal-500)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                New
              </span>
            ) : null}
            {item.stock_status === 'limited' ? (
              <span className="absolute right-2 top-2 z-[1] rounded bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Low stock
              </span>
            ) : null}
            {activeImg ? (
              <>
                {productImg ? (
                  <Image
                    src={productImg}
                    alt=""
                    fill
                    className="object-contain p-2"
                    sizes="(max-width: 640px) 50vw, 200px"
                    onError={() => setProductImgError(true)}
                    unoptimized
                  />
                ) : brandImg ? (
                  <Image
                    src={brandImg}
                    alt=""
                    fill
                    className="object-contain p-3"
                    sizes="(max-width: 640px) 50vw, 200px"
                    onError={() => setBrandImgError(true)}
                    unoptimized
                  />
                ) : categoryImg ? (
                  <Image
                    src={categoryImg}
                    alt=""
                    fill
                    className="object-contain p-3"
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

        {/* Cart control — bottom-right */}
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
              'absolute bottom-2 right-2 z-[2] flex h-9 items-center gap-1 rounded-lg bg-[#1C1C1E] px-3 text-xs font-semibold uppercase tracking-wide text-white shadow-md',
              'active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
            )}
            aria-label="Add to cart"
          >
            <Plus className="h-3.5 w-3.5" />
            ADD
          </button>
        )}
      </div>

      <Pressable asChild haptic>
        <Link
          href={productHref}
          onClick={() => markBuyerNavigationForward()}
          className="flex flex-1 flex-col gap-1 p-3 no-underline"
        >
          {item.brand_name ? (
            <p className="truncate text-xs font-medium uppercase tracking-wider text-[var(--fg-3)]">{item.brand_name}</p>
          ) : null}
          <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--fg-1)]">{item.display_name}</p>
          {item.default_uom ? <p className="text-xs text-[var(--fg-3)]">{item.default_uom}</p> : null}
          <div className="mt-auto space-y-0.5 pt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--fg-3)]">Your price</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-[var(--fg-1)]">
                {formatCurrency(item.price)}
              </span>
            </div>
            {showMrpLine ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--fg-3)]">MRP</span>
                <span className="font-mono text-xs tabular-nums text-[var(--fg-3)] line-through">
                  {formatCurrency(item.mrp)}
                </span>
              </div>
            ) : null}
          </div>
          {showStockBadge ? <StockBadge status={item.stock_status} /> : null}
        </Link>
      </Pressable>
    </div>
  );
}
