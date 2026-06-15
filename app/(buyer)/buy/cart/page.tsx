'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Trash2, Minus, Plus, Package, ArrowLeft } from 'lucide-react';
import { useCart, type BuyerCartItem } from '@/contexts/BuyerCartContext';
import { formatCurrency } from '@/lib/utils';

export default function CartPage() {
  const router = useRouter();
  const { items, itemCount, subtotal, removeItem, updateQty } = useCart();

  if (items.length === 0) {
    return (
      <>
        {/* Header */}
        <header
          className="sticky top-0 z-20 flex items-center gap-2 px-4"
          style={{
            height: 'var(--header-h, 56px)',
            background: 'rgba(253, 251, 247, 0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border-1)',
          }}
        >
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--fg-1, var(--cream-900))' }}
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
            My Cart
          </h1>
        </header>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center px-6 py-24 gap-4 text-center">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{ background: 'var(--cream-100)' }}
          >
            <ShoppingCart className="w-8 h-8" style={{ color: 'var(--cream-400)' }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
              Your cart is empty
            </h2>
            <p className="text-sm" style={{ color: 'var(--fg-3, var(--cream-600))' }}>
              Add products from the catalog to get started.
            </p>
          </div>
          <Link
            href="/buy/catalog"
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--teal-500)' }}
          >
            Browse Catalog
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center gap-2 px-4"
        style={{
          height: 'var(--header-h, 56px)',
          background: 'rgba(253, 251, 247, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-1)',
        }}
      >
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--fg-1, var(--cream-900))' }}
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold flex-1" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
          My Cart
        </h1>
        <span className="text-xs font-medium" style={{ color: 'var(--fg-3, var(--cream-600))' }}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </header>

      {/* Scrollable item list */}
      <div className="px-4 py-4 space-y-3" style={{ paddingBottom: '6rem' }}>
        {items.map((item) => (
          <CartPageItem
            key={item.tenant_product_id}
            item={item}
            onQtyChange={updateQty}
            onRemove={removeItem}
          />
        ))}
      </div>

      {/* Sticky footer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 px-4 pt-3 border-t"
        style={{
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(253, 251, 247, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderColor: 'var(--border-1)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium" style={{ color: 'var(--fg-3, var(--cream-700))' }}>
            Subtotal
          </span>
          <span
            className="text-base font-semibold"
            style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}
          >
            {formatCurrency(subtotal)}
          </span>
        </div>
        <Link
          href="/buy/checkout"
          className="flex items-center justify-center gap-2 w-full h-12 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--teal-500)' }}
        >
          Submit Inquiry →
        </Link>
      </div>
    </>
  );
}

function CartPageItem({
  item,
  onQtyChange,
  onRemove,
}: {
  item: BuyerCartItem;
  onQtyChange: (tenant_product_id: string, qty: number) => void;
  onRemove: (tenant_product_id: string) => void;
}) {
  return (
    <div
      className="flex gap-3 rounded-xl p-3"
      style={{
        background: 'var(--bg-surface, var(--cream-50))',
        border: '1px solid var(--border-1)',
      }}
    >
      {/* Thumbnail */}
      <div
        className="h-16 w-16 rounded-lg flex items-center justify-center overflow-hidden shrink-0"
        style={{ background: 'var(--cream-100)' }}
      >
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <Package className="h-6 w-6" style={{ color: 'var(--cream-400)' }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {item.brand && (
          <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--fg-3, var(--cream-500))' }}>
            {item.brand}
          </p>
        )}
        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
          {item.name}
        </p>
        {item.internal_sku && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3, var(--cream-600))', fontFamily: 'var(--font-mono)' }}>
            {item.internal_sku}
          </p>
        )}
        {/* Price × qty = line total row */}
        <p className="text-xs mt-1" style={{ color: 'var(--fg-3, var(--cream-700))', fontFamily: 'var(--font-mono)' }}>
          {formatCurrency(item.unit_price)} × {item.quantity} ={' '}
          <span className="font-semibold" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
            {formatCurrency(item.line_total)}
          </span>
        </p>
      </div>

      {/* Controls column */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        {/* Remove */}
        <button
          onClick={() => onRemove(item.tenant_product_id)}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--cream-400)' }}
          aria-label="Remove item"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        {/* Qty stepper */}
        <div className="flex items-center rounded-lg overflow-hidden" style={{ background: 'var(--cream-100)' }}>
          <button
            onClick={() => onQtyChange(item.tenant_product_id, item.quantity - 1)}
            className="h-8 w-8 flex items-center justify-center transition-colors"
            style={{ color: 'var(--teal-500)' }}
            aria-label="Decrease quantity"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span
            className="text-sm font-semibold min-w-[2rem] text-center"
            style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}
          >
            {item.quantity}
          </span>
          <button
            onClick={() => onQtyChange(item.tenant_product_id, item.quantity + 1)}
            className="h-8 w-8 flex items-center justify-center transition-colors"
            style={{ color: 'var(--teal-500)' }}
            aria-label="Increase quantity"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
