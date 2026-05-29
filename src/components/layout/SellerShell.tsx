import { ReactNode } from 'react';
import { useState } from 'react';
import { SellerSidebar } from './SellerSidebar';
import { SellerGlobalHeader } from './SellerGlobalHeader';

interface SellerShellProps {
  children: ReactNode;
}

export function SellerShell({ children }: SellerShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const sidebarWidth = isSidebarCollapsed ? '88px' : '248px';

  return (
    <div className="min-h-screen bg-cream-100" style={{ ['--sidebar-w' as string]: sidebarWidth }}>
      <SellerSidebar isCollapsed={isSidebarCollapsed} onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)} />
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
