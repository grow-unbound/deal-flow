import { ReactNode } from 'react';
import { BuyerTabBar } from './BuyerTabBar';

interface BuyerShellProps {
  children: ReactNode;
}

export function BuyerShell({ children }: BuyerShellProps) {
  return (
    <div className="flex flex-col min-h-screen bg-cream-100">
      {/* Content — padded to clear fixed header + tab bar */}
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: 'var(--header-h)',
          paddingBottom: 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {children}
      </main>
      <BuyerTabBar />
    </div>
  );
}
