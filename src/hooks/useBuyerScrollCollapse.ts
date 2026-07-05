'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { usePathname } from 'next/navigation';
import { useBuyerScrollRoot } from '@/contexts/BuyerScrollContext';

const SCROLL_DELTA_THRESHOLD = 8;

/**
 * Collapses the catalog landing title row when the user scrolls down past the top band;
 * expands again on scroll up or when back at the top.
 */
export function useBuyerScrollCollapse(): {
  collapsed: boolean;
  sentinelRef: RefObject<HTMLDivElement>;
} {
  const pathname = usePathname();
  const scrollContext = useBuyerScrollRoot();
  const scrollRoot = scrollContext?.scrollRoot ?? null;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(false);
  }, [pathname]);

  const setCollapsedStable = useCallback((next: boolean) => {
    setCollapsed((prev) => (prev === next ? prev : next));
  }, []);

  // Sentinel leaves the scrollport → compact header (reliable with sticky header).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!scrollRoot || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setCollapsedStable(!entry.isIntersecting);
      },
      { root: scrollRoot, threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRoot, pathname, setCollapsedStable]);

  // Scroll-up re-expands the title row before the sentinel re-enters view; IO handles collapse.
  useEffect(() => {
    if (!scrollRoot) return;

    let lastScrollTop = scrollRoot.scrollTop;

    const onScroll = () => {
      const scrollTop = scrollRoot.scrollTop;
      if (scrollTop < 4) {
        setCollapsedStable(false);
        lastScrollTop = scrollTop;
        return;
      }

      const delta = scrollTop - lastScrollTop;
      if (delta < -SCROLL_DELTA_THRESHOLD) {
        setCollapsedStable(false);
      }
      lastScrollTop = scrollTop;
    };

    scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollRoot.removeEventListener('scroll', onScroll);
  }, [scrollRoot, pathname, setCollapsedStable]);

  return { collapsed, sentinelRef };
}
