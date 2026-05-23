'use client';

import * as React from 'react';
import { Package, Minus, Plus } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

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
    onQuantityChange?.(product.id, quantity + minQty);
  }

  function decrement() {
    const next = quantity - minQty;
    onQuantityChange?.(product.id, next <= 0 ? 0 : next);
  }

  return (
    <div className={cn('bg-white rounded-lg border border-cream-200 shadow-xs overflow-hidden', className)}>
      {/* Image */}
      <button
        className="w-full aspect-square bg-cream-100 flex items-center justify-center overflow-hidden"
        onClick={() => onClick?.(product.id)}
        aria-label={`View ${product.name}`}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
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
          {formatCurrency(product.price)}
          {product.unit && <span className="text-caption font-sans text-cream-500 font-normal"> / {product.unit}</span>}
        </p>

        {/* Quantity control */}
        {product.inStock ? (
          quantity === 0 ? (
            <button
              onClick={increment}
              className="mt-2 w-full h-9 rounded-md bg-teal-500 text-cream-50 text-body-sm font-medium transition-colors hover:bg-teal-400 active:bg-teal-600"
            >
              Add
            </button>
          ) : (
            <div className="mt-2 flex items-center justify-between bg-cream-100 rounded-md overflow-hidden">
              <button
                onClick={decrement}
                className="h-9 w-9 flex items-center justify-center text-teal-500 hover:bg-cream-200 active:bg-cream-300 transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-body-sm font-semibold font-mono text-cream-900 min-w-[2rem] text-center">
                {quantity}
              </span>
              <button
                onClick={increment}
                className="h-9 w-9 flex items-center justify-center text-teal-500 hover:bg-cream-200 active:bg-cream-300 transition-colors"
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
