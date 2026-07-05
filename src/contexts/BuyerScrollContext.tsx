'use client';

import { createContext, useContext, type RefObject } from 'react';

export interface BuyerScrollRootContextValue {
  scrollRootRef: RefObject<HTMLElement | null>;
  /** Set via callback ref on `<main>` so scroll hooks re-subscribe once the scrollport mounts. */
  scrollRoot: HTMLElement | null;
}

export const BuyerScrollRootContext = createContext<BuyerScrollRootContextValue | null>(null);

export function useBuyerScrollRoot(): BuyerScrollRootContextValue | null {
  return useContext(BuyerScrollRootContext);
}
