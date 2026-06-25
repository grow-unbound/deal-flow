'use client';

import * as React from 'react';
import { ProductCard } from './ProductCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import type { BuyerCatalogItem } from '@/types/buyer';

interface ProductGridProps {
  items: BuyerCatalogItem[];
  loading?: boolean;
}

export function ProductGrid({ items, loading = false }: ProductGridProps) {
  if (loading) return <LoadingSkeleton count={6} />;

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 px-2 pb-3">
      {items.map((item) => (
        <ProductCard key={item.id} item={item} />
      ))}
    </div>
  );
}
