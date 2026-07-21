'use client';

import { formatNumberValue } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Pressable } from '@/components/ui/pressable';
import { useCart } from '@/contexts/BuyerCartContext';
import { useBuyerScrollChromeState } from '@/contexts/BuyerScrollChromeContext';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { isBuyerLandingRoute } from '@/lib/buyer-routes';
;

/** Product detail sticky footer: button row + padding + safe-area buffer. */
const PRODUCT_STICKY_FOOTER_LIFT = 'calc(5.5rem + env(safe-area-inset-bottom, 0px) + 12px)';

export function CartBar() {
  const pathname = usePathname();
  const { itemCount, subtotal } = useCart();
  const { tabBarVisible } = useBuyerScrollChromeState();
  const isLanding = isBuyerLandingRoute(pathname);
  const tabBarShown = isLanding && tabBarVisible;

  if (itemCount === 0) return null;

  const hasStickyFooter = pathname.startsWith('/buy/product/');

  const bottomOffset = hasStickyFooter
    ? PRODUCT_STICKY_FOOTER_LIFT
    : tabBarShown
      ? 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px) + 12px)'
      : 'calc(24px + env(safe-area-inset-bottom, 0px))';

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-40 flex w-full -translate-x-1/2 justify-center px-4"
      style={{ bottom: bottomOffset, maxWidth: BUYER_PREVIEW_MAX_WIDTH }}
    >
      <Pressable asChild haptic>
        <Link
          href="/buy/cart"
          className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm font-medium text-white shadow-lg transition-transform duration-fast ease-standard active:scale-[0.98]"
          style={{
            background: 'var(--teal-500)',
            boxShadow: '0 8px 24px rgba(31, 58, 52, 0.30), 0 2px 6px rgba(31, 58, 52, 0.20)',
          }}
        >
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
            style={{ background: 'var(--ember-400, #C26E3A)', fontFamily: 'var(--font-mono)' }}
          >
            {itemCount}
          </span>
          <span>View cart</span>
          <span className="opacity-60">·</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {formatNumberValue(subtotal, 'CURRENCY_EXACT')}
          </span>
          <ChevronRight className="h-4 w-4 opacity-85" aria-hidden />
        </Link>
      </Pressable>
    </div>
  );
}
