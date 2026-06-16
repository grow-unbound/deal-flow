'use client';

import Link from 'next/link';
import { ShoppingCart, Trash2, Minus, Plus, Package } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCart, type BuyerCartItem } from '@/contexts/BuyerCartContext';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';

interface CartSheetProps {
  open: boolean;
  onClose: () => void;
}

export function CartSheet({ open, onClose }: CartSheetProps) {
  const { items, itemCount, subtotal, removeItem, updateQty } = useCart();

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col rounded-t-2xl p-0">
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: 'var(--border-1)' }}>
          <SheetTitle className="flex items-center gap-2 text-base" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
            <ShoppingCart className="h-5 w-5" style={{ color: 'var(--teal-500)' }} />
            Cart
            {itemCount > 0 && (
              <span
                className="ml-1 text-xs font-semibold rounded-full px-2 py-0.5 text-white"
                style={{ background: 'var(--teal-500)' }}
              >
                {itemCount}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
              <ShoppingCart className="h-12 w-12" style={{ color: 'var(--cream-300)' }} />
              <p className="text-sm" style={{ color: 'var(--fg-3, var(--cream-500))' }}>
                Your cart is empty
              </p>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Browse catalog
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <CartItemRow
                  key={item.tenant_product_id}
                  item={item}
                  onQtyChange={updateQty}
                  onRemove={removeItem}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div
            className="px-5 pt-3 pb-5 border-t space-y-3"
            style={{
              borderColor: 'var(--border-1)',
              paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--fg-3, var(--cream-700))' }}>
                Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
              </span>
              <span
                className="text-base font-semibold"
                style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}
              >
                {formatCurrency(subtotal)}
              </span>
            </div>
            <Pressable asChild haptic>
              <Link
                href="/buy/checkout"
                onClick={onClose}
                className="flex h-12 w-full touch-manipulation items-center justify-center rounded-xl text-sm font-semibold text-white transition-transform duration-fast ease-standard hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'var(--teal-500)' }}
              >
                Proceed to Checkout
              </Link>
            </Pressable>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CartItemRow({
  item,
  onQtyChange,
  onRemove,
}: {
  item: BuyerCartItem;
  onQtyChange: (tenant_product_id: string, qty: number) => void;
  onRemove: (tenant_product_id: string) => void;
}) {
  return (
    <div className="flex gap-3 items-start">
      {/* Thumbnail */}
      <div
        className="h-14 w-14 rounded-lg flex items-center justify-center overflow-hidden shrink-0"
        style={{ background: 'var(--cream-100)' }}
      >
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <Package className="h-5 w-5" style={{ color: 'var(--cream-400)' }} />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        {item.brand && (
          <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--fg-3, var(--cream-500))' }}>
            {item.brand}
          </p>
        )}
        <p className="text-sm font-medium truncate" style={{ color: 'var(--fg-1, var(--cream-900))' }}>
          {item.name}
        </p>
        {item.internal_sku && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3, var(--cream-600))', fontFamily: 'var(--font-mono)' }}>
            {item.internal_sku}
          </p>
        )}
        <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3, var(--cream-700))' }}>
          <span className="tabular-inline">{formatCurrency(item.unit_price)}</span>{item.unit ? ` / ${item.unit}` : ''}
        </p>
      </div>

      {/* Qty + remove */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <button
          onClick={() => onRemove(item.tenant_product_id)}
          className="transition-colors"
          style={{ color: 'var(--cream-400)' }}
          aria-label="Remove item"
          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger-500, #e53e3e)'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--cream-400)'; }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center rounded-md overflow-hidden" style={{ background: 'var(--cream-100)' }}>
          <button
            onClick={() => onQtyChange(item.tenant_product_id, item.quantity - 1)}
            className="h-7 w-7 flex items-center justify-center transition-colors hover:bg-cream-200"
            style={{ color: 'var(--teal-500)' }}
            aria-label="Decrease quantity"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span
            className="text-sm font-semibold min-w-[1.75rem] text-center"
            style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}
          >
            {item.quantity}
          </span>
          <button
            onClick={() => onQtyChange(item.tenant_product_id, item.quantity + 1)}
            className="h-7 w-7 flex items-center justify-center transition-colors hover:bg-cream-200"
            style={{ color: 'var(--teal-500)' }}
            aria-label="Increase quantity"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <p className="text-xs font-semibold" style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}>
          {formatCurrency(item.line_total)}
        </p>
      </div>
    </div>
  );
}
