'use client';

import { cn, formatNumberValue } from '@/lib/utils';
import type { ProductPickerProduct } from '@/hooks/useProductPicker';

/**
 * Row content only (name + SKU/category/price/metrics line) — mirrors BuyerPickerRow's
 * split between content and interactive wrapper.
 */
export function ProductRowContent({ product }: { product: ProductPickerProduct }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-base font-medium text-cream-900">{product.display_name}</p>
      <p className="mt-0.5 truncate text-sm text-cream-700">
        {product.internal_sku ?? '—'}
        {product.brand_name ? ` · ${product.brand_name}` : ''}
        {product.category_name ? ` · ${product.category_name}` : ''}
        {product.base_selling_price != null ? ` · ₹${Math.round(product.base_selling_price).toLocaleString('en-IN')} base rate` : ''}
      </p>
      <p className="mt-0.5 truncate text-sm text-cream-700">
        {formatNumberValue(product.invoice_value, 'CURRENCY_THRESHOLD')} sales QTD
        {' · '}
        {formatNumberValue(product.invoice_units, 'COUNT')} units sold
      </p>
    </div>
  );
}

export function ProductPickerRow({
  product,
  selected,
  onClick,
  readOnly = false,
}: {
  product: ProductPickerProduct;
  selected: boolean;
  onClick?: () => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <div className="flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-[10px]">
        <ProductRowContent product={product} />
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
          Matches
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-[10px] text-left transition-colors',
        selected ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
      )}
    >
      <ProductRowContent product={product} />
      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
        {selected ? 'Selected' : 'Add'}
      </span>
    </button>
  );
}
