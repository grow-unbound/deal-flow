import { ReactNode } from 'react';
import { SellerSidebar } from './SellerSidebar';

interface SellerShellProps {
  children: ReactNode;
}

export function SellerShell({ children }: SellerShellProps) {
  return (
    <div className="min-h-screen bg-cream-100">
      <SellerSidebar />
      {/* Main content offset by sidebar width + topbar height */}
      <main
        className="min-h-screen"
        style={{ marginLeft: 'var(--sidebar-w)' }}
      >
        {children}
      </main>
    </div>
  );
}
