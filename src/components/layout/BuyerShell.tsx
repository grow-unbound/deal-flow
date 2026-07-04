'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { isBuyerCartPillRoute, isBuyerDeepRoute, isBuyerLandingRoute } from '@/lib/buyer-routes';
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
  scrollRootRef: React.RefObject<HTMLDivElement>;
}) {
  const pathname = usePathname();
  const isDeep = isBuyerDeepRoute(pathname);
  const isLanding = isBuyerLandingRoute(pathname);
  const { tabBarVisible } = useBuyerScrollChromeState();
  const showTabBarPadding = !isDeep && (!isLanding || tabBarVisible);

  return (
    <main
      ref={scrollRootRef}
      className="flex-1 overflow-y-auto"
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
  const { data: me } = useBuyerMe();

  // WhatsApp Broadcast Phase C (§4.8, §9): forced, one-time consent gate.
  // Defense-in-depth alongside the redirect already issued right after OTP
  // verify — covers direct navigation/back-button/deep-links into /buy/*
  // before the checkbox has ever been confirmed for this buyer.
  useEffect(() => {
    if (me?.whatsapp_consent_required) {
      router.replace('/consent');
    }
  }, [me?.whatsapp_consent_required, router]);

  return (
    <BuyerRealtimeProvider>
      <div data-app="buyer" className="min-h-screen bg-[var(--bg-page)] md:px-4 md:py-6">
        <div
          className="mx-auto flex min-h-screen w-full flex-col bg-[var(--bg-page)] md:min-h-[calc(100vh-3rem)] md:overflow-hidden md:rounded-[28px] md:border md:border-[var(--cream-300)] md:bg-[var(--bg-page)] md:shadow-[0_20px_60px_rgba(20,40,35,0.08)]"
          style={{ maxWidth: `${BUYER_PREVIEW_MAX_WIDTH}px` }}
        >
          <BuyerPreviewBootstrap>
            <BuyerScrollRootContext.Provider value={scrollRootRef}>
              <BuyerScrollChromeProvider>
                <BuyerShellMain scrollRootRef={scrollRootRef}>{children}</BuyerShellMain>
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
