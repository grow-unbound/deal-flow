'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';

import { getAnalyticsRouteInfo } from '@/lib/analytics-route';
import { useSellerAnalyticsIds } from '@/lib/analytics-identity';
import { cn } from '@/lib/utils';

interface DetailTab {
  id: string;
  label: string;
  badge?: number | string;
}

interface DetailTabsProps {
  tabs: DetailTab[];
  active: string;
  onChange?: (tabId: string) => void;
}

function getSellerDetailEntityType(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const sellerIndex = segments[0] === 'seller' ? 1 : 0;
  const primary = segments[sellerIndex] ?? 'unknown';
  const secondary = segments[sellerIndex + 1];

  if (primary === 'settings' && secondary) return `settings_${secondary}`;
  return primary;
}

export function DetailTabs({ tabs, active, onChange }: DetailTabsProps) {
  const posthog = usePostHog();
  const pathname = usePathname();
  const analyticsIds = useSellerAnalyticsIds();
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === active) ?? null, [active, tabs]);
  const routeInfo = useMemo(() => getAnalyticsRouteInfo(pathname), [pathname]);
  const entityType = useMemo(() => getSellerDetailEntityType(pathname), [pathname]);
  const viewedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeTab) return;
    const key = `${pathname}:${activeTab.id}`;
    if (viewedKeyRef.current === key) return;
    viewedKeyRef.current = key;

    posthog?.capture('seller_detail_tab_viewed', {
      ...routeInfo,
      ...analyticsIds,
      entity_type: entityType,
      tab_id: activeTab.id,
      tab_label: activeTab.label,
    });
  }, [activeTab, analyticsIds, entityType, pathname, posthog, routeInfo]);

  return (
    <div
      className="mx-0 mt-4 flex rounded-[10px] bg-cream-200 p-[3px] md:mt-6 md:rounded-none md:border-b md:border-cream-300 md:bg-transparent md:p-0"
      role="tablist"
      aria-orientation="horizontal"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => {
              posthog?.capture('seller_detail_tab_clicked', {
                ...routeInfo,
                ...analyticsIds,
                entity_type: entityType,
                tab_id: tab.id,
                tab_label: tab.label,
                previous_tab_id: active,
                was_active: isActive,
              });
              onChange?.(tab.id);
            }}
            className={cn(
              'inline-flex flex-1 items-center justify-center rounded-lg border-b-0 border-transparent px-2 py-1.5 text-[var(--b-text-sub)] font-medium text-cream-700 transition-colors hover:text-cream-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-300/70 md:flex-none md:rounded-none md:border-b-2 md:px-5 md:py-3.5 md:text-base',
              isActive && 'bg-white text-teal-500 shadow-[0_1px_2px_rgba(31,58,52,0.06)] md:border-ember-500 md:bg-transparent md:text-cream-950 md:shadow-none'
            )}
          >
            <span>{tab.label}</span>
            {tab.badge != null ? (
              <span className="ml-2 rounded-full bg-cream-200 px-2 py-0.5 text-xs font-semibold text-cream-700">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type { DetailTab, DetailTabsProps };
