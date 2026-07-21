'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Prefetch on pointerdown/touchstart instead of hover — an explicit press signal
 * fires once per href and precedes the click's own navigation by only a few ms, so
 * it warms the route/query cache without hover's much higher, repeat-happy call
 * volume against the server/DB.
 *
 * Returns a stable callback factory rather than being itself called per-row, so it's
 * safe to use from inside a list's `.map()` without violating the rules of hooks.
 */
export function usePointerPrefetch() {
  const router = useRouter();
  const firedRef = useRef<Set<string>>(new Set());

  const prefetchOnPress = useCallback(
    (href: string, prefetchExtra?: () => void) => () => {
      if (firedRef.current.has(href)) return;
      firedRef.current.add(href);
      router.prefetch(href);
      prefetchExtra?.();
    },
    [router],
  );

  return prefetchOnPress;
}
