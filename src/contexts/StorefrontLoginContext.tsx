'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { BuyerMeData } from '@/hooks/useBuyerMe';

interface StorefrontLoginContextValue {
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
}

const StorefrontLoginContext = createContext<StorefrontLoginContextValue | null>(null);

export function StorefrontLoginProvider({ children }: { children: ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  // Task 10 gated-action rule: a `buyer_pending` session (self-registered,
  // awaiting seller approval / needs_more_info / declined) that attempts a
  // gated action (add to cart, checkout, quick-add, "buy now", etc. — every
  // one of them already funnels into this single openLogin() call across the
  // buyer catalog components) must be routed to /pending, not re-shown the
  // OTP login overlay it already has a session past. Fully-unauthenticated
  // guests (no session at all) and fully-approved buyers are unaffected —
  // this only special-cases mode === 'pending', read from the already-cached
  // /api/buyer/me response (no extra fetch; falls through to the normal
  // overlay if that query hasn't populated the cache yet, same as any other
  // consumer of useBuyerMe before it resolves).
  const openLogin = useCallback(() => {
    const cached = queryClient.getQueryData<BuyerMeData>(['buyer-me']);
    if (cached?.mode === 'pending') {
      router.push('/pending');
      return;
    }
    setLoginOpen(true);
  }, [queryClient, router]);

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
