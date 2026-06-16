'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'df_buyer_nav_direction';

export type BuyerNavDirection = 'forward' | 'back';

/**
 * Call before navigating deeper into the stack (e.g. catalog → detail).
 */
export function markBuyerNavigationForward(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, 'forward');
}

/**
 * Call before `router.back()` from a deep screen so `template` can animate out.
 */
export function markBuyerNavigationBack(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, 'back');
}

/**
 * Consumes one-shot direction from sessionStorage when `pathname` changes (cleared after read).
 */
export function useBuyerNavigationDirection(pathname: string): BuyerNavDirection {
  const [dir, setDir] = useState<BuyerNavDirection>('forward');

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    setDir(raw === 'back' ? 'back' : 'forward');
  }, [pathname]);

  return dir;
}
