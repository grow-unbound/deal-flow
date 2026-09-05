'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface StorefrontLoginContextValue {
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
}

const StorefrontLoginContext = createContext<StorefrontLoginContextValue | null>(null);

export function StorefrontLoginProvider({ children }: { children: ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const openLogin = useCallback(() => setLoginOpen(true), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);
  const value = useMemo(() => ({ loginOpen, openLogin, closeLogin }), [loginOpen, openLogin, closeLogin]);
  return <StorefrontLoginContext.Provider value={value}>{children}</StorefrontLoginContext.Provider>;
}

export function useStorefrontLoginOptional(): StorefrontLoginContextValue | null {
  return useContext(StorefrontLoginContext);
}

export function useStorefrontLogin(): StorefrontLoginContextValue {
  const ctx = useContext(StorefrontLoginContext);
  if (!ctx) {
    return {
      loginOpen: false,
      openLogin: () => {},
      closeLogin: () => {},
    };
  }
  return ctx;
}
