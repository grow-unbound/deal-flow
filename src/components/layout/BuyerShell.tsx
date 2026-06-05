'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { BuyerPreviewBootstrap } from './BuyerPreviewBootstrap';
import { BuyerTabBar } from './BuyerTabBar';

const DEEP_SCREENS = ['/shop/product/', '/shop/cart', '/shop/checkout'];

interface BuyerShellProps {
  children: ReactNode;
}

export function BuyerShell({ children }: BuyerShellProps) {
  const pathname = usePathname();
  const isDeep = DEEP_SCREENS.some(p => pathname.startsWith(p));

  return (
    <div className="min-h-screen bg-cream-100 md:px-4 md:py-6">
      <div
        className="mx-auto flex min-h-screen w-full flex-col bg-cream-100 md:min-h-[calc(100vh-3rem)] md:overflow-hidden md:rounded-[28px] md:border md:border-cream-300 md:bg-white md:shadow-[0_20px_60px_rgba(20,40,35,0.08)]"
        style={{ maxWidth: `${BUYER_PREVIEW_MAX_WIDTH}px` }}
      >
        <BuyerPreviewBootstrap>
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
        </BuyerPreviewBootstrap>
        <BuyerTabBar />
      </div>
    </div>
  );
}
