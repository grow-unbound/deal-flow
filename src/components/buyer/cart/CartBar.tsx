'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { Pressable } from '@/components/ui/pressable';
import { useCart } from '@/contexts/BuyerCartContext';
import { formatCurrency } from '@/lib/utils';

export function CartBar() {
  const { itemCount, subtotal } = useCart();

  if (itemCount === 0) return null;

  return (
    <div
      className="fixed left-0 right-0 z-40 px-4"
      style={{ bottom: 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px) + 8px)' }}
    >
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg"
        style={{
          background: 'var(--bg-surface, var(--cream-50))',
          border: '1px solid var(--border-1)',
        }}
      >
        {/* Item count badge */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
            style={{ background: 'var(--teal-500)' }}
          >
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p
              className="text-xs font-medium leading-tight"
              style={{ color: 'var(--fg-3, var(--cream-600))' }}
            >
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
            <p
              className="text-sm font-semibold leading-tight"
              style={{ color: 'var(--fg-1, var(--cream-900))', fontFamily: 'var(--font-mono)' }}
            >
              {formatCurrency(subtotal)}
            </p>
          </div>
        </div>

        {/* View Cart button */}
        <Pressable asChild haptic>
          <Link
            href="/buy/cart"
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-transform duration-fast ease-standard hover:opacity-90 active:scale-[0.98] active:opacity-80"
            style={{ background: 'var(--teal-500)' }}
          >
            <ShoppingCart className="h-4 w-4" />
            View Cart
          </Link>
        </Pressable>
      </div>
    </div>
  );
}
