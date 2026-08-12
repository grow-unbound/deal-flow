'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface BuyerCatalogDesktopLayoutProps {
  rail?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  splitScroll?: boolean;
  style?: React.CSSProperties;
}

export function BuyerCatalogDesktopLayout({
  rail = null,
  children,
  contentClassName,
  splitScroll = false,
  style,
}: BuyerCatalogDesktopLayoutProps): React.ReactNode {
  if (!rail) {
    return (
      <div className={cn('px-4 pb-4 sm:px-4 lg:px-4 lg:pb-6', contentClassName)} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div
      style={style}
      className={cn(
        'grid items-start grid-cols-[92px_minmax(0,1fr)] gap-3 px-2 pb-4 sm:grid-cols-[108px_minmax(0,1fr)] sm:gap-4 sm:px-3 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:px-4 lg:pb-6',
        splitScroll ? 'min-h-0 h-full flex-1 items-stretch grid-rows-[minmax(0,1fr)] overflow-hidden' : '',
      )}
    >
      <aside
        className={cn(
          'min-w-0 self-start pr-2 sm:pr-3 lg:pt-6 lg:pr-4',
          splitScroll ? 'min-h-0 h-full self-stretch overflow-hidden' : '',
        )}
      >
        <div className={cn('sticky top-3 lg:top-[10.5rem]', splitScroll ? 'flex h-full min-h-0 flex-col' : '')}>
          <div
            className={cn(
              'border-r border-[var(--border-1)] pr-2 sm:pr-3 lg:pr-4',
              splitScroll ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]' : '',
            )}
            data-buyer-nested-scroll={splitScroll ? 'true' : undefined}
          >
            {rail}
          </div>
        </div>
      </aside>
      <div
        className={cn(
          'min-w-0',
          splitScroll ? 'min-h-0 h-full self-stretch overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]' : '',
          contentClassName,
        )}
        data-buyer-nested-scroll={splitScroll ? 'true' : undefined}
      >
        {children}
      </div>
    </div>
  );
}
