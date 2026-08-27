'use client';

import { useCallback, useRef, useState } from 'react';

// Hysteresis band: collapse only once scrolled comfortably past the top, expand only once
// scrolled back comfortably near it. A single shared threshold flickers on short lists —
// trackpad rubber-band overscroll oscillates scrollTop by a few px right at the boundary,
// re-triggering collapse/expand every frame ("flash").
const COLLAPSE_AT_PX = 40;
const EXPAND_AT_PX = 12;

/**
 * Scroll-direction based collapse state for picker overlay headers: scrolling the list down
 * past a threshold collapses the header (title + search + selected-items stay sticky,
 * everything else — quick/advanced filters, select-all/clear — animates away); scrolling up
 * past a lower threshold restores it. Only setState on an actual collapsed/expanded
 * transition, not every scroll tick. No-ops entirely when the list has no real overflow
 * (nothing to scroll — a short result set must never flicker).
 */
export function useStickyPickerHeader() {
  const [collapsed, setCollapsed] = useState(false);
  const lastScrollTopRef = useRef(0);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.scrollHeight <= el.clientHeight) return;

    const scrollTop = el.scrollTop;
    const lastScrollTop = lastScrollTopRef.current;

    if (scrollTop > lastScrollTop && scrollTop > COLLAPSE_AT_PX) {
      setCollapsed((prev) => (prev ? prev : true));
    } else if (scrollTop < lastScrollTop && scrollTop < EXPAND_AT_PX) {
      setCollapsed((prev) => (prev ? false : prev));
    }

    lastScrollTopRef.current = scrollTop;
  }, []);

  const reset = useCallback(() => {
    lastScrollTopRef.current = 0;
    setCollapsed(false);
  }, []);

  return { collapsed, handleScroll, reset };
}
