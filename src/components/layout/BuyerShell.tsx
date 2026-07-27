'use client';

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import {
  isBuyerCartPillRoute,
  isBuyerChromelessRoute,
  isBuyerDeepRoute,
  isBuyerLandingRoute,
} from '@/lib/buyer-routes';
import { isActiveBuyerRefreshQuery } from '@/lib/buyer-refresh';
import { BuyerScrollRootContext } from '@/contexts/BuyerScrollContext';
import { BuyerScrollChromeProvider, useBuyerScrollChromeState } from '@/contexts/BuyerScrollChromeContext';
import { BuyerRealtimeProvider, useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { BuyerPreviewBootstrap } from './BuyerPreviewBootstrap';
import { BuyerTabBar } from './BuyerTabBar';
import { CartBar } from '@/components/buyer/cart/CartBar';
import { BuyerSearchOverlay } from '@/components/buyer/layout/BuyerSearchOverlay';
import { BuyerPullToRefresh } from '@/components/buyer/layout/BuyerPullToRefresh';
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const isDeep = isBuyerDeepRoute(pathname);
  const isLanding = isBuyerLandingRoute(pathname);
  const isChromeless = isDeep || isBuyerChromelessRoute(pathname);
  const { tabBarVisible } = useBuyerScrollChromeState();
  const { triggerRefresh } = useBuyerRealtimeContext();
  const showTabBarPadding = !isChromeless && (!isLanding || tabBarVisible);
  const canPullToRefresh = !isBuyerChromelessRoute(pathname);

  const handleRefresh = useCallback(async () => {
    if (triggerRefresh) {
      await triggerRefresh();
      return;
    }

    const activeQueries = queryClient.getQueryCache().getAll().filter(isActiveBuyerRefreshQuery);
    if (activeQueries.length === 0) {
      router.refresh();
      return;
    }

    await queryClient.refetchQueries({
      type: 'active',
      predicate: (query) => isActiveBuyerRefreshQuery(query),
    });
  }, [queryClient, router, triggerRefresh]);

  return (
    <BuyerPullToRefresh
      viewportRef={scrollRootRef}
      pullEnabled={canPullToRefresh}
      onRefresh={handleRefresh}
      className="min-h-0 flex-1"
      style={{
        paddingBottom: showTabBarPadding
          ? 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px))'
          : 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {children}
    </BuyerPullToRefresh>
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
