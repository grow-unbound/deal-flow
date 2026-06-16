'use client';

import { createContext, useContext, type RefObject } from 'react';

export const BuyerScrollRootContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function useBuyerScrollRoot(): RefObject<HTMLElement | null> | null {
  return useContext(BuyerScrollRootContext);
}
