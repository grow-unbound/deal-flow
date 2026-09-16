'use client';

import * as React from 'react';
import { BUYER_DETAIL_RAIL_GRID_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';

interface BuyerCatalogDesktopLayoutProps {
  rail?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  splitScroll?: boolean;
  style?: React.CSSProperties;
}

/** Scrollbar stays invisible until the pane is actively scrolled, matching the
 * `.dashboard-vscroll` pattern used elsewhere in the app (e.g. seller dashboard cards). */
function useScrollActiveClass(): { active: boolean; onScroll: () => void } {
  const [active, setActive] = React.useState(false);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const onScroll = React.useCallback(() => {
    setActive(true);
    if (resetTimerRef.current != null) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setActive(false);
      resetTimerRef.current = null;
    }, 900);
  }, []);

  return { active, onScroll };
}

export function BuyerCatalogDesktopLayout({
  rail = null,
  children,
  contentClassName,
  splitScroll = false,
  style,
}: BuyerCatalogDesktopLayoutProps): React.ReactNode {
  const railScroll = useScrollActiveClass();
  const contentScroll = useScrollActiveClass();

  if (!rail) {
    return (
      <div
        className={cn(
          'px-4 pb-4 sm:px-4 lg:px-4 lg:pb-6',
          splitScroll
            ? cn(
                'dashboard-vscroll min-h-0 h-full overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]',
                contentScroll.active && 'dashboard-vscroll--active',
              )
            : '',
          contentClassName,
        )}
        style={style}
        data-buyer-nested-scroll={splitScroll ? 'true' : undefined}
        onScroll={splitScroll ? contentScroll.onScroll : undefined}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      style={style}
      className={cn(
        BUYER_DETAIL_RAIL_GRID_CLASS,
        splitScroll ? 'min-h-0 h-full flex-1 items-stretch grid-rows-[minmax(0,1fr)] overflow-hidden pb-0 lg:pb-0' : '',
      )}
    >
      <aside
        className={cn(
          'min-w-0 self-start pr-1.5 sm:pr-3 lg:pt-6 lg:pr-4',
          splitScroll ? 'min-h-0 h-full self-stretch overflow-hidden' : '',
        )}
      >
        <div className={cn('sticky top-3 lg:top-[10.5rem]', splitScroll ? 'flex h-full min-h-0 flex-col' : '')}>
          <div
            className={cn(
              'border-r border-[var(--border-1)]',
              splitScroll
                ? cn(
                    'dashboard-vscroll min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]',
                    railScroll.active && 'dashboard-vscroll--active',
                  )
                : '',
            )}
            data-buyer-nested-scroll={splitScroll ? 'true' : undefined}
            onScroll={splitScroll ? railScroll.onScroll : undefined}
          >
            {rail}
          </div>
        </div>
      </aside>
      <div
        className={cn(
          'min-w-0',
          splitScroll
            ? cn(
                'dashboard-vscroll min-h-0 h-full self-stretch overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]',
                contentScroll.active && 'dashboard-vscroll--active',
              )
            : '',
          contentClassName,
        )}
        data-buyer-nested-scroll={splitScroll ? 'true' : undefined}
        onScroll={splitScroll ? contentScroll.onScroll : undefined}
      >
        {children}
      </div>
    </div>
  );
}
