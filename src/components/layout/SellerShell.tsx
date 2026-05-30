import { ReactNode } from 'react';
import { useEffect } from 'react';
import { useState } from 'react';
import { SellerSidebar } from './SellerSidebar';
import { SellerGlobalHeader } from './SellerGlobalHeader';

interface SellerShellProps {
  children: ReactNode;
}

const LARGE_SCREEN_QUERY = '(min-width: 1536px)';

export function SellerShell({ children }: SellerShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(LARGE_SCREEN_QUERY);
    const updateLayoutMode = () => setIsLargeScreen(mediaQuery.matches);

    updateLayoutMode();
    mediaQuery.addEventListener('change', updateLayoutMode);

    return () => {
      mediaQuery.removeEventListener('change', updateLayoutMode);
    };
  }, []);

  const effectiveSidebarCollapsed = isLargeScreen ? false : isSidebarCollapsed;
  const canCollapseSidebar = !isLargeScreen;
  const sidebarWidth = effectiveSidebarCollapsed ? '88px' : '248px';

  return (
    <div className="min-h-screen bg-cream-100" style={{ ['--sidebar-w' as string]: sidebarWidth }}>
      <SellerSidebar
        isCollapsed={effectiveSidebarCollapsed}
        canCollapse={canCollapseSidebar}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />
      <main
        className="min-h-screen pt-16 transition-[margin-left] duration-base"
        style={{ marginLeft: 'var(--sidebar-w)' }}
      >
        <SellerGlobalHeader />
        {children}
      </main>
    </div>
  );
}
