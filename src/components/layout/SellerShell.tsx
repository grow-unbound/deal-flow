import { ReactNode } from 'react';
import { SellerSidebar } from './SellerSidebar';
import { SellerGlobalHeader } from './SellerGlobalHeader';

interface SellerShellProps {
  children: ReactNode;
}

export function SellerShell({ children }: SellerShellProps) {
  return (
    <div className="min-h-screen bg-cream-100">
      <SellerSidebar />
      <main
        className="min-h-screen pt-16"
        style={{ marginLeft: 'var(--sidebar-w)' }}
      >
        <SellerGlobalHeader />
        {children}
      </main>
    </div>
  );
}
