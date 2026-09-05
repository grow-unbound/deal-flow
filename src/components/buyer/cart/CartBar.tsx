'use client';

import { formatNumberValue } from '@/lib/utils';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Pressable } from '@/components/ui/pressable';
import { useCart } from '@/contexts/BuyerCartContext';
import { useBuyerScrollChromeState } from '@/contexts/BuyerScrollChromeContext';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { STOREFRONT } from '@/lib/storefront-paths';
import { isBuyerLandingRoute } from '@/lib/buyer-routes';

/** Product detail sticky footer: button row + padding + safe-area buffer. */
const PRODUCT_STICKY_FOOTER_LIFT =
  'calc(5.5rem + env(safe-area-inset-bottom, 0px) + 12px)';

export function CartBar() {
  const pathname = usePathname();
  const posthog = usePostHog();
  const { itemCount, subtotal } = useCart();
  const { tabBarVisible } = useBuyerScrollChromeState();
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const isLanding = isBuyerLandingRoute(pathname);
  const tabBarShown = isLanding && tabBarVisible;

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const syncIsMobile = () => setIsMobile(mediaQuery.matches);

    syncIsMobile();
    mediaQuery.addEventListener('change', syncIsMobile);
    return () => mediaQuery.removeEventListener('change', syncIsMobile);
  }, []);

  if (!mounted || !isMobile || itemCount === 0) return null;

  const hasStickyFooter = pathname.startsWith('/buy/product/');

  const bottomOffset = hasStickyFooter
    ? PRODUCT_STICKY_FOOTER_LIFT
    : tabBarShown
      ? 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px) + 12px)'
      : 'calc(24px + env(safe-area-inset-bottom, 0px))';

  return createPortal(
    <div
      className="pointer-events-none fixed left-1/2 z-40 flex w-full -translate-x-1/2 justify-center px-4"
      style={{ bottom: bottomOffset, maxWidth: BUYER_PREVIEW_MAX_WIDTH }}
    >
      <Pressable asChild haptic>
        <Link
          href={STOREFRONT.cart}
          onClick={() => {
            posthog?.capture('buyer_cart_opened', {
              source_surface: 'floating_cart_bar',
              current_path: pathname,
              item_count: itemCount,
              subtotal,
            });
          }}
          className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm font-medium text-white shadow-lg transition-transform duration-fast ease-standard active:scale-[0.98]"
          style={{
            background: 'var(--teal-500)',
            boxShadow: '0 8px 24px rgba(31, 58, 52, 0.30), 0 2px 6px rgba(31, 58, 52, 0.20)',
          }}
        >
          <span
            className="rounded-full px-2 py-0.5 text-[length:var(--b-text-sub)] font-semibold text-white"
            style={{ background: 'var(--ember-400)', fontFamily: 'var(--font-mono)' }}
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
    </div>,
    document.body,
  );
}
