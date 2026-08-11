'use client';

import { ReactNode, Suspense } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
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

interface SellerShellMeta {
  featureAvailability: SellerShellFeatureAvailability;
  branding: { tenantName: string; tenantLogoUrl: string | null };
}

export function SellerShell({ children, featureAvailabilityPromise, tenantBrandingPromise }: SellerShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [isForcedCollapsed, setIsForcedCollapsed] = useState(false);
  const [shellMetaOverride, setShellMetaOverride] = useState<SellerShellMeta | null>(null);
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

  const lastRevalidateRef = useRef(Date.now());
  const revalidateShellMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/shell-meta', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as SellerShellMeta;
      setShellMetaOverride(data);
    } catch {
      // Best-effort — the SSR-streamed values stay in place on failure.
    }
  }, []);

  useEffect(() => {
    // The shell's feature-availability/branding promises resolve once per layout
    // mount and don't refetch on client-side nav (layouts persist across routes).
    // Re-resolve on tab refocus so a toggle changed elsewhere (another tab, or by
    // another teammate) shows up — via a narrow JSON fetch of just this data,
    // not router.refresh() (which used to re-render the whole route tree).
    function handleVisibility() {
      if (
        document.visibilityState === 'visible'
        && Date.now() - lastRevalidateRef.current > SHELL_REVALIDATE_THROTTLE_MS
      ) {
        lastRevalidateRef.current = Date.now();
        void revalidateShellMeta();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [revalidateShellMeta]);

  const layout = resolveSellerSidebarLayout({
    isUserCollapsed: isSidebarCollapsed,
    isLargeScreen,
    isForcedCollapsed,
  });
  const hasMobileBottomTabs = isMobileBottomTabRoute(pathname);

  return (
    <SellerRealtimeProvider>
      <div
        data-app="seller"
        className="min-h-screen bg-[var(--bg-surface)]"
        style={{ ['--sidebar-w' as string]: layout.sidebarWidth }}
      >
        <div className="hidden md:block">
          <Suspense fallback={<SellerSidebarSkeleton isCollapsed={layout.isCollapsed} />}>
            <SellerSidebar
              isCollapsed={layout.isCollapsed}
              canCollapse={layout.canCollapse}
              onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
              featureAvailabilityPromise={featureAvailabilityPromise}
              featureAvailabilityOverride={shellMetaOverride?.featureAvailability}
            />
          </Suspense>
        </div>
        <main
          className={[
            'min-h-dvh transition-[margin-left] duration-base md:ml-[var(--sidebar-w)] md:min-h-screen md:pb-0 md:pt-14',
            hasMobileBottomTabs ? 'pb-[calc(60px+env(safe-area-inset-bottom,0px))]' : 'pb-0',
          ].join(' ')}
        >
          <div className="hidden md:block">
            <Suspense fallback={<SellerGlobalHeaderSkeleton />}>
              <SellerGlobalHeader
                tenantBrandingPromise={tenantBrandingPromise}
                tenantBrandingOverride={shellMetaOverride?.branding}
              />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <SellerMobileTopbar
              tenantBrandingPromise={tenantBrandingPromise}
              featureAvailabilityPromise={featureAvailabilityPromise}
              tenantBrandingOverride={shellMetaOverride?.branding}
              featureAvailabilityOverride={shellMetaOverride?.featureAvailability}
            />
          </Suspense>
          {children}
        </main>
        <SellerMobileBottomTabs />
      </div>
    </SellerRealtimeProvider>
  );
}
