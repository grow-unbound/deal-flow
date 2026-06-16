'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { isBuyerDeepRoute, isBuyerLandingRoute } from '@/lib/buyer-routes';
import { useBuyerNavigationDirection } from '@/hooks/useBuyerNavigationDirection';

/**
 * Slide transition between landing ↔ deep routes (CSS only; no framer-motion per plan).
 */
export default function BuyerRouteTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const direction = useBuyerNavigationDirection(pathname);
  const prevPathRef = React.useRef(pathname);

  const fromLanding = isBuyerLandingRoute(prevPathRef.current);
  const toDeep = isBuyerDeepRoute(pathname);
  const fromDeep = isBuyerDeepRoute(prevPathRef.current);
  const toLanding = isBuyerLandingRoute(pathname);

  const shouldAnimate =
    (fromLanding && toDeep && direction === 'forward')
    || (fromDeep && toLanding && direction === 'back')
    || (fromDeep && toDeep && prevPathRef.current !== pathname);

  React.useEffect(() => {
    prevPathRef.current = pathname;
  }, [pathname]);

  const animClass = shouldAnimate
    ? direction === 'back'
      ? 'animate-buyer-pop-exit'
      : 'animate-buyer-push-enter'
    : '';

  return (
    <div
      key={pathname}
      className={`min-h-0 flex-1 ${animClass}`}
      style={{ willChange: shouldAnimate ? 'transform, opacity' : undefined }}
    >
      {children}
    </div>
  );
}
