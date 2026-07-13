'use client';

import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS } from '@/lib/buyer-lookbook';
import { ProductCard } from './ProductCard';
import type { BuyerCatalogItem } from '@/types/buyer';

interface RecoCarouselProps {
  items: BuyerCatalogItem[];
}

export function RecoCarousel({ items }: RecoCarouselProps) {
  if (items.length === 0) return null;

  return (
    <BuyerHorizontalScroll className="gap-3 px-4">
      {items.map((item) => (
        <ProductCard key={item.tenant_product_id} item={item} className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} shrink-0`} />
      ))}
    </BuyerHorizontalScroll>
  );
}
