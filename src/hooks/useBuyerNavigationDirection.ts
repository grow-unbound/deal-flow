'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'df_buyer_nav_direction';
const DEFAULT_BUYER_BACK_FALLBACK = '/buy/catalog';

export type BuyerNavDirection = 'forward' | 'back';
export interface BuyerBackRouter {
  back: () => void;
  replace: (href: string) => void;
}

function canUseBrowserBack(): boolean {
  if (typeof window === 'undefined') return false;
  const state = window.history.state as { idx?: unknown } | null;
  return typeof state?.idx === 'number' && state.idx > 0;
}

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
 * Navigates back when this tab has a real history stack; otherwise returns to buyer home.
 */
export function navigateBuyerBack(
  router: BuyerBackRouter,
  fallbackHref: string = DEFAULT_BUYER_BACK_FALLBACK,
): void {
  markBuyerNavigationBack();
  if (canUseBrowserBack()) {
    router.back();
    return;
  }
  router.replace(fallbackHref);
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
