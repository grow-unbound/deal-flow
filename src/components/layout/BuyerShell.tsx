'use client';

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import {
  isBuyerCartPillRoute,
  isBuyerChromelessRoute,
  isBuyerDeepRoute,
  isBuyerLandingRoute,
} from '@/lib/buyer-routes';
import { BuyerScrollRootContext } from '@/contexts/BuyerScrollContext';
import { BuyerScrollChromeProvider, useBuyerScrollChromeState } from '@/contexts/BuyerScrollChromeContext';
import { BuyerRealtimeProvider } from '@/contexts/BuyerRealtimeContext';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { BuyerPreviewBootstrap } from './BuyerPreviewBootstrap';
import { BuyerTabBar } from './BuyerTabBar';
import { CartBar } from '@/components/buyer/cart/CartBar';
import { BuyerSearchOverlay } from '@/components/buyer/layout/BuyerSearchOverlay';

interface BuyerShellProps {
  children: ReactNode;
}

function BuyerShellMain({
  children,
  scrollRootRef,
}: {
  children: ReactNode;
  scrollRootRef: React.RefCallback<HTMLDivElement>;
}) {
  const pathname = usePathname();
  const isDeep = isBuyerDeepRoute(pathname);
  const isLanding = isBuyerLandingRoute(pathname);
  const isChromeless = isDeep || isBuyerChromelessRoute(pathname);
  const { tabBarVisible } = useBuyerScrollChromeState();
  const showTabBarPadding = !isChromeless && (!isLanding || tabBarVisible);

  return (
    <main
      ref={scrollRootRef}
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      style={{
        paddingBottom: showTabBarPadding
          ? 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px))'
          : 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {children}
    </main>
  );
}

export function BuyerShell({ children }: BuyerShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const { data: me } = useBuyerMe();

  const handleScrollRootRef = useCallback((node: HTMLDivElement | null) => {
    scrollRootRef.current = node;
    setScrollRoot(node);
  }, []);

  const scrollRootContextValue = useMemo(
    () => ({ scrollRootRef, scrollRoot }),
    [scrollRoot],
  );

  useEffect(() => {
    if (me?.whatsapp_consent_required) {
      router.replace('/consent');
    }
  }, [me?.whatsapp_consent_required, router]);

  return (
    <BuyerRealtimeProvider>
      <div data-app="buyer" className="min-h-dvh bg-[var(--bg-page)] md:px-4 md:py-6">
        <div
          className="mx-auto flex h-dvh w-full flex-col overflow-hidden bg-[var(--bg-page)] md:h-[calc(100dvh-3rem)] md:rounded-[28px] md:border md:border-[var(--cream-300)] md:shadow-[0_20px_60px_rgba(20,40,35,0.08)]"
          style={{ maxWidth: `${BUYER_PREVIEW_MAX_WIDTH}px` }}
        >
          <BuyerPreviewBootstrap>
            <BuyerScrollRootContext.Provider value={scrollRootContextValue}>
              <BuyerScrollChromeProvider>
                <BuyerShellMain scrollRootRef={handleScrollRootRef}>{children}</BuyerShellMain>
                {isBuyerCartPillRoute(pathname) ? <CartBar /> : null}
                <BuyerTabBar />
              </BuyerScrollChromeProvider>
            </BuyerScrollRootContext.Provider>
          </BuyerPreviewBootstrap>
        </div>
      </div>
      <BuyerSearchOverlay />
    </BuyerRealtimeProvider>
  );
}
