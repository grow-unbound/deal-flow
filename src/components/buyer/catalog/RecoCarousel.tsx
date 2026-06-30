'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Package, ShoppingCart } from 'lucide-react';

import { formatCurrency } from '@/lib/utils';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import type { BuyerCatalogItem } from '@/types/buyer';

interface RecoCarouselProps {
  items: BuyerCatalogItem[];
  widget: string;
  sourceProductId?: string;
  onAddToCart?: (item: BuyerCatalogItem, widget: string, sourceProductId: string | undefined) => void;
}

export function RecoCarousel({ items, widget, sourceProductId, onAddToCart }: RecoCarouselProps): React.ReactNode {
  if (items.length === 0) return null;

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
      {items.map((item) => (
        <div
          key={item.tenant_product_id}
          className="relative shrink-0 rounded-xl"
          style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)', width: 120 }}
        >
          <Link
            href={`/buy/product/${item.tenant_product_id}`}
            onClick={() => markBuyerNavigationForward()}
            className="block no-underline"
          >
            <div
              className="relative overflow-hidden rounded-t-xl"
              style={{ paddingTop: '72%', background: 'var(--cream-100)' }}
            >
              {item.image_urls[0] ? (
                <Image
                  src={item.image_urls[0]}
                  alt={item.display_name}
                  fill
                  className="object-contain p-2"
                  sizes="120px"
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Package className="h-6 w-6" style={{ color: 'var(--cream-400)' }} />
                </div>
              )}
            </div>
            <div className="px-2 pb-8 pt-2">
              <p className="line-clamp-2 text-xs font-medium leading-tight" style={{ color: 'var(--fg-1)' }}>
                {item.display_name}
              </p>
              <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-mono)' }}>
                {formatCurrency(item.price)}
              </p>
            </div>
          </Link>

          {/* Add to cart button — shown only when onAddToCart is provided */}
          {onAddToCart && item.stock_status !== 'out_of_stock' && (
            <button
              type="button"
              aria-label={`Add ${item.display_name} to cart`}
              onClick={() => onAddToCart(item, widget, sourceProductId)}
              className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full"
              style={{ background: 'var(--teal-500)', color: '#fff' }}
            >
              <ShoppingCart className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
