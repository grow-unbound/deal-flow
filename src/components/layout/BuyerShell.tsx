'use client';

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  isBuyerCartPillRoute,
  isBuyerChromelessRoute,
  isBuyerDeepRoute,
  isBuyerLandingRoute,
  shouldShowBuyerDesktopBreadcrumbs,
} from '@/lib/buyer-routes';
import { isActiveBuyerRefreshQuery } from '@/lib/buyer-refresh';
import { BuyerScrollRootContext } from '@/contexts/BuyerScrollContext';
import { BuyerScrollChromeProvider, useBuyerScrollChromeState } from '@/contexts/BuyerScrollChromeContext';
import { BuyerRealtimeProvider, useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { BuyerPreviewBootstrap } from './BuyerPreviewBootstrap';
import { BuyerTabBar } from './BuyerTabBar';
import { CartBar } from '@/components/buyer/cart/CartBar';
import { BuyerPullToRefresh } from '@/components/buyer/layout/BuyerPullToRefresh';
import { BuyerDesktopHeader } from '@/components/buyer/layout/BuyerDesktopHeader';
import { BuyerDesktopBreadcrumbs } from '@/components/buyer/layout/BuyerDesktopBreadcrumbs';
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
  const isChromeless = isBuyerChromelessRoute(pathname);
  const showDesktopBreadcrumbs = shouldShowBuyerDesktopBreadcrumbs(pathname);
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
      contentClassName="flex h-full min-h-0 flex-col"
      className={`min-h-0 flex-1 ${showTabBarPadding ? '[--buyer-bottom-chrome:var(--tab-bar-h)] md:[--buyer-bottom-chrome:0px]' : '[--buyer-bottom-chrome:0px]'}`}
      style={{ paddingBottom: 'calc(var(--buyer-bottom-chrome, 0px) + env(safe-area-inset-bottom, 0px))' }}
    >
      {!isChromeless ? (
        <>
          <BuyerDesktopHeader />
          {showDesktopBreadcrumbs ? <BuyerDesktopBreadcrumbs /> : null}
        </>
      ) : null}
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
      <div data-app="buyer" className="min-h-dvh bg-[var(--bg-page)]">
        <div
          className="mx-auto flex h-dvh w-full max-w-[1440px] flex-col overflow-hidden bg-[var(--bg-page)] md:h-dvh md:max-w-[1440px] md:rounded-none md:border-0 md:shadow-none"
        >
          <BuyerPreviewBootstrap>
            <BuyerScrollRootContext.Provider value={scrollRootContextValue}>
              <BuyerScrollChromeProvider>
                <BuyerShellMain scrollRootRef={handleScrollRootRef}>{children}</BuyerShellMain>
                {isBuyerCartPillRoute(pathname) ? <div className="md:hidden"><CartBar /></div> : null}
                <BuyerTabBar />
              </BuyerScrollChromeProvider>
            </BuyerScrollRootContext.Provider>
          </BuyerPreviewBootstrap>
        </div>
      </div>
    </BuyerRealtimeProvider>
  );
}
