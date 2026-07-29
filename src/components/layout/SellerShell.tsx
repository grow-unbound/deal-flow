'use client';

import { ReactNode, Suspense } from 'react';
import { useEffect } from 'react';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SellerSidebar } from './SellerSidebar';
import { SellerGlobalHeader } from './SellerGlobalHeader';
import { SellerMobileBottomTabs, SellerMobileTopbar } from './SellerMobileChrome';
import { SellerSidebarSkeleton, SellerGlobalHeaderSkeleton } from './SellerShellSkeletons';
import { resolveSellerSidebarLayout } from './seller-sidebar-layout';
import { SellerRealtimeProvider } from '@/contexts/SellerRealtimeContext';
import type { SellerShellFeatureAvailability } from '@/lib/server/seller-features';

interface SellerShellProps {
  children: ReactNode;
  featureAvailabilityPromise: Promise<SellerShellFeatureAvailability>;
  tenantBrandingPromise: Promise<{
    tenantName: string;
    tenantLogoUrl: string | null;
  }>;
}

const LARGE_SCREEN_QUERY = '(min-width: 1536px)';
const FORCED_COLLAPSE_QUERY = '(max-width: 1279px)';

const SHELL_REVALIDATE_THROTTLE_MS = 15_000;

function isMobileBottomTabRoute(pathname: string) {
  return (
    pathname === '/dashboard' ||
    pathname === '/customers' ||
    pathname === '/products' ||
    pathname === '/estimates' ||
    pathname === '/sales-orders' ||
    pathname === '/invoices'
  );
}

export function SellerShell({ children, featureAvailabilityPromise, tenantBrandingPromise }: SellerShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [isForcedCollapsed, setIsForcedCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const largeScreenQuery = window.matchMedia(LARGE_SCREEN_QUERY);
    const forcedCollapseQuery = window.matchMedia(FORCED_COLLAPSE_QUERY);
    const updateLayoutMode = () => {
      setIsLargeScreen(largeScreenQuery.matches);
      setIsForcedCollapsed(forcedCollapseQuery.matches);
    };

    updateLayoutMode();
    largeScreenQuery.addEventListener('change', updateLayoutMode);
    forcedCollapseQuery.addEventListener('change', updateLayoutMode);

    return () => {
      largeScreenQuery.removeEventListener('change', updateLayoutMode);
      forcedCollapseQuery.removeEventListener('change', updateLayoutMode);
    };
  }, []);

  useEffect(() => {
    // The shell's feature-availability/branding promises resolve once per layout
    // mount and don't refetch on client-side nav (layouts persist across routes).
    // Re-resolve on tab refocus so a toggle changed elsewhere (another tab, or by
    // another teammate) shows up without requiring a manual hard reload.
    let lastRevalidate = Date.now();
    function handleVisibility() {
      if (document.visibilityState === 'visible' && Date.now() - lastRevalidate > SHELL_REVALIDATE_THROTTLE_MS) {
        lastRevalidate = Date.now();
        router.refresh();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [router]);

  const layout = resolveSellerSidebarLayout({
    isUserCollapsed: isSidebarCollapsed,
    isLargeScreen,
    isForcedCollapsed,
  });
  const hasMobileBottomTabs = isMobileBottomTabRoute(pathname);

  return (
    <SellerRealtimeProvider>
      <div className="min-h-screen bg-[var(--bg-surface)]" style={{ ['--sidebar-w' as string]: layout.sidebarWidth }}>
        <div className="hidden md:block">
          <Suspense fallback={<SellerSidebarSkeleton isCollapsed={layout.isCollapsed} />}>
            <SellerSidebar
              isCollapsed={layout.isCollapsed}
              canCollapse={layout.canCollapse}
              onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
              featureAvailabilityPromise={featureAvailabilityPromise}
            />
          </Suspense>
        </div>
        <main
          className={[
            'min-h-dvh transition-[margin-left] duration-base md:ml-[var(--sidebar-w)] md:min-h-screen md:pb-0 md:pt-16',
            hasMobileBottomTabs ? 'pb-[calc(60px+env(safe-area-inset-bottom,0px))]' : 'pb-0',
          ].join(' ')}
        >
          <div className="hidden md:block">
            <Suspense fallback={<SellerGlobalHeaderSkeleton />}>
              <SellerGlobalHeader tenantBrandingPromise={tenantBrandingPromise} />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <SellerMobileTopbar
              tenantBrandingPromise={tenantBrandingPromise}
              featureAvailabilityPromise={featureAvailabilityPromise}
            />
          </Suspense>
          {children}
        </main>
        <SellerMobileBottomTabs />
      </div>
    </SellerRealtimeProvider>
  );
}
