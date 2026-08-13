'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/BuyerCartContext';
import { formatNumberValue } from '@/lib/utils';

interface BuyerDesktopCartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BuyerDesktopCartDrawer({ open, onOpenChange }: BuyerDesktopCartDrawerProps) {
  const { items, updateQty, removeItem } = useCart();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[min(28rem,100vw)] flex-col border-l border-cream-200 bg-[var(--cream-100)] p-0 sm:max-w-[28rem]">
        <SheetHeader className="border-b border-cream-200 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cream-100 text-cream-800">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-left text-[1.2rem] font-semibold text-cream-950">Cart</SheetTitle>
              <p className="text-sm text-cream-600">
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cream-100 text-cream-500">
              <ShoppingCart className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold text-cream-900">Your cart is empty</p>
              <p className="text-sm text-cream-600">Add products from the catalog to review them here.</p>
            </div>
            <Button asChild onClick={() => onOpenChange(false)}>
              <Link href="/buy/catalog">Browse catalog</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-3">
                {items.map((item) => (
                  <article key={item.tenant_product_id} className="rounded-[18px] border border-cream-200 bg-white p-3 shadow-[var(--shadow-xs)]">
                    <div className="flex items-start gap-3">
                      <div className="relative h-16 w-16 overflow-hidden rounded-[14px] border border-cream-200 bg-cream-100">
                        {item.image_url ? (
                          <Image src={item.image_url} alt={item.name} fill sizes="64px" className="object-cover" unoptimized />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-cream-900">{item.name}</p>
                        <p className="mt-1 text-xs text-cream-600">
                          {formatNumberValue(item.unit_price, 'CURRENCY_EXACT')} each
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-2 py-1">
                            <button
                              type="button"
                              onClick={() => updateQty(item.tenant_product_id, Math.max(1, item.quantity - 1))}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-cream-700 transition-colors hover:bg-cream-100"
                              aria-label={`Reduce quantity of ${item.name}`}
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="min-w-[1.5rem] text-center text-sm font-semibold text-cream-900">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateQty(item.tenant_product_id, item.quantity + 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-cream-700 transition-colors hover:bg-cream-100"
                              aria-label={`Increase quantity of ${item.name}`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.tenant_product_id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-rose-600 transition-colors hover:bg-rose-50"
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-cream-100 pt-3">
                      <span className="text-xs font-medium uppercase tracking-[0.12em] text-cream-500">Line total</span>
                      <span className="text-sm font-semibold text-cream-900">{formatNumberValue(item.line_total, 'CURRENCY_EXACT')}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="border-t border-cream-200 bg-white px-5 py-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-medium text-cream-600">Subtotal</span>
                <span className="text-lg font-semibold text-cream-950">{formatNumberValue(subtotal, 'CURRENCY_EXACT')}</span>
              </div>
              <Button asChild className="h-12 w-full rounded-[14px]" onClick={() => onOpenChange(false)}>
                <Link href="/buy/cart">Open cart</Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
