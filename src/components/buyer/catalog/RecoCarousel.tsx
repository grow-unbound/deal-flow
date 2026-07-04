'use client';

import { ProductCard } from './ProductCard';
import type { BuyerCatalogItem } from '@/types/buyer';

interface RecoCarouselProps {
  items: BuyerCatalogItem[];
}

export function RecoCarousel({ items }: RecoCarouselProps) {
  if (items.length === 0) return null;

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
      {items.map((item) => (
        <ProductCard key={item.tenant_product_id} item={item} className="w-[160px] shrink-0" />
      ))}
    </div>
  );
}
