'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BuyerTabBar } from './BuyerTabBar';

const DEEP_SCREENS = ['/shop/product/', '/shop/cart', '/shop/checkout'];

interface BuyerShellProps {
  children: ReactNode;
}

export function BuyerShell({ children }: BuyerShellProps) {
  const pathname = usePathname();
  const isDeep = DEEP_SCREENS.some(p => pathname.startsWith(p));

  return (
    <div className="flex flex-col h-screen bg-cream-100">
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: isDeep
            ? 'env(safe-area-inset-bottom, 0px)'
            : 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {children}
      </main>
      <BuyerTabBar />
    </div>
  );
}
