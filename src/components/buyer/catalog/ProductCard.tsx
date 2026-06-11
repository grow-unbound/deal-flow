'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Package } from 'lucide-react';
import { Pressable } from '@/components/ui/pressable';
import { cn, formatCurrency } from '@/lib/utils';
import { StockBadge } from './StockBadge';
import type { BuyerCatalogItem } from '@/types/buyer';

interface ProductCardProps {
  item: BuyerCatalogItem;
  className?: string;
}

export function ProductCard({ item, className }: ProductCardProps) {
  const [imgError, setImgError] = React.useState(false);
  const firstImage = !imgError && item.image_urls.length > 0 ? item.image_urls[0] : null;
  const isOos = item.stock_status === 'out_of_stock';
  const hasDiscount = item.mrp > 0 && item.price < item.mrp;

  return (
    <Pressable asChild haptic>
      <Link
        href={`/shop/product/${item.tenant_product_id}`}
        className={cn(
          'flex flex-col bg-[var(--bg-surface)] border border-[var(--border-1)] rounded-xl overflow-hidden',
          'hover:border-[var(--border-2)] transition-colors no-underline',
          isOos && 'opacity-60',
          className,
        )}
      >
      {/* Image */}
      <div className="relative aspect-square bg-[var(--bg-recessed)] flex items-center justify-center overflow-hidden">
        {firstImage ? (
          <Image
            src={firstImage}
            alt={item.display_name}
            fill
            className="object-contain p-2"
            sizes="(max-width: 640px) 50vw, 200px"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <Package className="h-10 w-10 text-[var(--fg-3)]" />
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        {item.brand_name && (
          <p className="text-[10px] uppercase tracking-wider text-[var(--fg-3)] font-medium truncate">
            {item.brand_name}
          </p>
        )}
        <p className="text-sm font-medium text-[var(--fg-1)] line-clamp-2 leading-snug">
          {item.display_name}
        </p>
        {item.default_uom && (
          <p className="text-xs text-[var(--fg-3)]">{item.default_uom}</p>
        )}
        <div className="flex items-baseline gap-1.5 mt-auto pt-1">
          <span className="text-sm font-bold font-mono text-[var(--fg-1)]">
            {formatCurrency(item.price)}
          </span>
          {hasDiscount && (
            <span className="text-xs font-mono text-[var(--fg-3)] line-through">
              {formatCurrency(item.mrp)}
            </span>
          )}
        </div>
        <StockBadge status={item.stock_status} />
      </div>
    </Link>
    </Pressable>
  );
}
