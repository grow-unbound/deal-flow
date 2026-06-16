'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useBuyerScrollChrome } from '@/hooks/useBuyerScrollChrome';

interface BuyerScrollChromeValue {
  tabBarVisible: boolean;
  isAtTop: boolean;
}

const BuyerScrollChromeContext = createContext<BuyerScrollChromeValue>({
  tabBarVisible: true,
  isAtTop: true,
});

export function BuyerScrollChromeProvider({ children }: { children: ReactNode }) {
  const chrome = useBuyerScrollChrome();
  return (
    <BuyerScrollChromeContext.Provider value={chrome}>{children}</BuyerScrollChromeContext.Provider>
  );
}

export function useBuyerScrollChromeState(): BuyerScrollChromeValue {
  return useContext(BuyerScrollChromeContext);
}
