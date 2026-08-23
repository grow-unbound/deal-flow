'use client';

import * as React from 'react';
import Image from 'next/image';
import { Package, Minus, Plus } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { cn, formatNumberValue } from '@/lib/utils';
import { BUYER_CARD_RADIUS_CLASS } from '@/lib/buyer-ui';

export interface ProductTileData {
  id: string;
  name: string;
  brand?: string;
  price: number;
  unit?: string;
  imageUrl?: string;
  inStock: boolean;
  minQty?: number;
}

interface ProductTileProps {
  product: ProductTileData;
  quantity?: number;
  onQuantityChange?: (id: string, qty: number) => void;
  onClick?: (id: string) => void;
  className?: string;
}

function ProductTile({ product, quantity = 0, onQuantityChange, onClick, className }: ProductTileProps) {
  const minQty = product.minQty ?? 1;

  function increment() {
    triggerHaptic('light');
    onQuantityChange?.(product.id, quantity + minQty);
  }

  function decrement() {
    triggerHaptic('light');
    const next = quantity - minQty;
    onQuantityChange?.(product.id, next <= 0 ? 0 : next);
  }

  return (
    <div className={cn(BUYER_CARD_RADIUS_CLASS, 'overflow-hidden border border-cream-300 bg-[var(--bg-surface)] shadow-xs', className)}>
      {/* Image */}
      <button
        type="button"
        className="relative flex aspect-square w-full touch-manipulation items-center justify-center overflow-hidden bg-cream-100 transition-transform duration-fast ease-standard active:scale-[0.98]"
        onClick={() => onClick?.(product.id)}
        aria-label={`View ${product.name}`}
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            unoptimized
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 200px"
          />
        ) : (
          <Package className="h-8 w-8 text-cream-400" />
        )}
      </button>

      {/* Info */}
      <div className="p-3">
        {product.brand && (
          <p className="eyebrow text-cream-500 mb-0.5">{product.brand}</p>
        )}
        <p
          className="text-body-sm font-medium text-cream-900 line-clamp-2 cursor-pointer hover:text-teal-500 transition-colors"
          onClick={() => onClick?.(product.id)}
        >
          {product.name}
        </p>
        <p className="text-body font-semibold font-mono text-cream-900 mt-1">
          {formatNumberValue(product.price, 'CURRENCY_EXACT')}
          {product.unit && <span className="text-caption font-sans text-cream-500 font-normal"> / {product.unit}</span>}
        </p>

        {/* Quantity control */}
        {product.inStock ? (
          quantity === 0 ? (
            <button
              type="button"
              onClick={increment}
            className="mt-2 flex h-9 w-full touch-manipulation items-center justify-center rounded-md bg-teal-500 text-body-sm font-medium text-cream-50 transition-transform duration-fast ease-standard hover:bg-teal-600 active:scale-[var(--yk-press-scale)] active:bg-teal-700"
            >
              Add
            </button>
          ) : (
            <div className="mt-2 flex items-center justify-between overflow-hidden rounded-md bg-cream-100">
              <button
                type="button"
                onClick={decrement}
                className="flex h-9 w-9 touch-manipulation items-center justify-center text-teal-500 transition-transform duration-fast ease-standard hover:bg-cream-200 active:scale-[var(--yk-press-scale)] active:bg-cream-300"
                aria-label="Decrease quantity"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-body-sm font-semibold font-mono text-cream-900 min-w-[2rem] text-center">
                {quantity}
              </span>
              <button
                type="button"
                onClick={increment}
                className="flex h-9 w-9 touch-manipulation items-center justify-center text-teal-500 transition-transform duration-fast ease-standard hover:bg-cream-200 active:scale-[var(--yk-press-scale)] active:bg-cream-300"
                aria-label="Increase quantity"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        ) : (
          <div className="mt-2 h-9 flex items-center justify-center rounded-md bg-cream-100 text-caption text-cream-500">
            Out of stock
          </div>
        )}
      </div>
    </div>
  );
}

export { ProductTile };
