'use client';

import { ReactNode, Suspense } from 'react';
import { useEffect } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SellerSidebar } from './SellerSidebar';
import { SellerGlobalHeader } from './SellerGlobalHeader';
import { SellerSidebarSkeleton, SellerGlobalHeaderSkeleton } from './SellerShellSkeletons';
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

const SHELL_REVALIDATE_THROTTLE_MS = 15_000;

export function SellerShell({ children, featureAvailabilityPromise, tenantBrandingPromise }: SellerShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const mediaQuery = window.matchMedia(LARGE_SCREEN_QUERY);
    const updateLayoutMode = () => setIsLargeScreen(mediaQuery.matches);

    updateLayoutMode();
    mediaQuery.addEventListener('change', updateLayoutMode);

    return () => {
      mediaQuery.removeEventListener('change', updateLayoutMode);
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

  const effectiveSidebarCollapsed = isLargeScreen ? false : isSidebarCollapsed;
  const canCollapseSidebar = !isLargeScreen;
  const sidebarWidth = effectiveSidebarCollapsed ? '88px' : '248px';

  return (
    <SellerRealtimeProvider>
      <div className="min-h-screen bg-[var(--bg-surface)]" style={{ ['--sidebar-w' as string]: sidebarWidth }}>
        <Suspense fallback={<SellerSidebarSkeleton isCollapsed={effectiveSidebarCollapsed} />}>
          <SellerSidebar
            isCollapsed={effectiveSidebarCollapsed}
            canCollapse={canCollapseSidebar}
            onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
            featureAvailabilityPromise={featureAvailabilityPromise}
          />
        </Suspense>
        <main
          className="min-h-screen pt-16 transition-[margin-left] duration-base"
          style={{ marginLeft: 'var(--sidebar-w)' }}
        >
          <Suspense fallback={<SellerGlobalHeaderSkeleton />}>
            <SellerGlobalHeader tenantBrandingPromise={tenantBrandingPromise} />
          </Suspense>
          {children}
        </main>
      </div>
    </SellerRealtimeProvider>
  );
}
