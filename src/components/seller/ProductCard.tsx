import * as React from 'react';
import Image from 'next/image';
import { Package, MoreHorizontal } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProductStatusPill, type ProductStatus } from '@/components/cockpit/StatusPill';

export interface ProductCardData {
  id: string;
  name: string;
  sku: string;
  brand?: string;
  basePrice: number;
  unit?: string;
  status: ProductStatus;
  imageUrl?: string;
  stock?: number;
}

interface ProductCardProps {
  product: ProductCardData;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  onMenuClick?: (id: string) => void;
  className?: string;
}

function ProductCard({ product, selected, onSelect, onMenuClick, className }: ProductCardProps) {
  return (
    <div
      className={cn(
        'group relative bg-white border rounded-lg shadow-xs overflow-hidden transition-shadow duration-fast hover:shadow-md',
        selected ? 'border-teal-400 ring-2 ring-teal-400/20' : 'border-cream-300',
        className
      )}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <div className="absolute top-3 left-3 z-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(product.id, e.target.checked)}
            className="h-4 w-4 rounded-xs border-cream-400 text-teal-500 focus:ring-teal-400 cursor-pointer"
            aria-label={`Select ${product.name}`}
          />
        </div>
      )}

      {/* Image */}
      <div className="relative aspect-[4/3] bg-cream-100 flex items-center justify-center overflow-hidden">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 260px"
            unoptimized
            className="object-cover"
          />
        ) : (
          <Package className="h-10 w-10 text-cream-400" />
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {product.brand && (
              <p className="eyebrow text-cream-500 mb-0.5">{product.brand}</p>
            )}
            <p className="text-body font-medium text-cream-900 truncate">{product.name}</p>
            <p className="text-caption text-cream-500 font-mono mt-0.5">{product.sku}</p>
          </div>
          {onMenuClick && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onMenuClick(product.id)}
              aria-label="Product options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between mt-3">
          <div>
            <span className="text-h4 font-mono font-semibold text-cream-900">
              {formatCurrency(product.basePrice)}
            </span>
            {product.unit && (
              <span className="text-caption text-cream-500 ml-1">/ {product.unit}</span>
            )}
          </div>
          <ProductStatusPill status={product.status} />
        </div>

        {product.stock !== undefined && (
          <p className="text-caption text-cream-500 mt-2">
            Stock: <span className={cn('font-medium', product.stock === 0 && 'text-danger-500')}>{product.stock} units</span>
          </p>
        )}
      </div>
    </div>
  );
}

export { ProductCard };
