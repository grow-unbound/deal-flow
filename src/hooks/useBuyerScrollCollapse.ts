'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { usePathname } from 'next/navigation';
import { useBuyerScrollRoot } from '@/contexts/BuyerScrollContext';

/**
 * When the sentinel scrolls out of the buyer `main` scrollport (top), `collapsed` becomes true.
 * Place the sentinel as the first element in the page flow after the collapsible header block.
 */
export function useBuyerScrollCollapse(): {
  collapsed: boolean;
  sentinelRef: RefObject<HTMLDivElement>;
} {
  const pathname = usePathname();
  const scrollRootRef = useBuyerScrollRoot();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(false);
  }, [pathname]);

  const setCollapsedStable = useCallback((next: boolean) => {
    setCollapsed((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    const root = scrollRootRef?.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // Sentinel visible at top of scrollport → expanded header; scrolled past → collapsed
        setCollapsedStable(!entry.isIntersecting);
      },
      { root, rootMargin: '0px 0px 0px 0px', threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRootRef, setCollapsedStable, pathname]);

  return { collapsed, sentinelRef };
}
