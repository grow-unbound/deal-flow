'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useBuyerScrollRoot } from '@/contexts/BuyerScrollContext';
import { isBuyerLandingRoute } from '@/lib/buyer-routes';

const SCROLL_DELTA_THRESHOLD = 8;
const TAB_BAR_HIDE_AFTER_PX = 48;

/**
 * Tracks scroll direction on the buyer `main` scrollport for tab-bar show/hide on landing routes.
 */
export function useBuyerScrollChrome(): {
  tabBarVisible: boolean;
  isAtTop: boolean;
} {
  const pathname = usePathname();
  const scrollContext = useBuyerScrollRoot();
  const scrollRoot = scrollContext?.scrollRoot ?? null;
  const [tabBarVisible, setTabBarVisible] = useState(true);
  const [isAtTop, setIsAtTop] = useState(true);

  const enabled = isBuyerLandingRoute(pathname);

  useEffect(() => {
    setTabBarVisible(true);
    setIsAtTop(true);
  }, [pathname]);

  const updateFromScroll = useCallback(
    (scrollTop: number, lastScrollTop: number) => {
      const atTop = scrollTop < 4;
      setIsAtTop(atTop);

      if (!enabled) {
        setTabBarVisible(true);
        return;
      }

      if (atTop) {
        setTabBarVisible(true);
        return;
      }

      const delta = scrollTop - lastScrollTop;
      if (Math.abs(delta) < SCROLL_DELTA_THRESHOLD) return;

      if (delta > 0 && scrollTop > TAB_BAR_HIDE_AFTER_PX) {
        setTabBarVisible(false);
      } else if (delta < 0) {
        setTabBarVisible(true);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!scrollRoot || !enabled) return;

    let lastScrollTop = scrollRoot.scrollTop;
    updateFromScroll(lastScrollTop, lastScrollTop);

    const onScroll = () => {
      const scrollTop = scrollRoot.scrollTop;
      updateFromScroll(scrollTop, lastScrollTop);
      lastScrollTop = scrollTop;
    };

    scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollRoot.removeEventListener('scroll', onScroll);
  }, [scrollRoot, enabled, pathname, updateFromScroll]);

  return { tabBarVisible: enabled ? tabBarVisible : true, isAtTop };
}
