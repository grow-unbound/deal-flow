'use client';

import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import {
  isSplitPaneDetailQuery,
  SPLIT_PANE_DETAIL_QUERY_KEY,
  SPLIT_PANE_DETAIL_QUERY_VALUE,
} from '@/lib/seller-split-pane';
import { cn } from '@/lib/utils';

export interface WorkspaceTab {
  label: string;
  href: string;
  match?: (pathname: string) => boolean;
}

export function WorkspaceTabs({ tabs, className }: { tabs: WorkspaceTab[]; className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { id } = useParams<{ id?: string }>();
  const visibleTabs = tabs.filter(Boolean);
  if (visibleTabs.length <= 1) return null;
  const preserveDetailPane = id != null || isSplitPaneDetailQuery(searchParams.get(SPLIT_PANE_DETAIL_QUERY_KEY));

  return (
    <nav
      className={cn(
        'mb-5 mt-4 hidden min-w-0 overflow-x-auto rounded-[10px] bg-cream-200 p-[3px] md:mb-6 md:mt-5 md:flex md:rounded-none md:border-b md:border-cream-300 md:bg-transparent md:p-0',
        className,
      )}
      aria-label="Workspace tabs"
    >
      {visibleTabs.map((tab) => {
        const active = tab.match ? tab.match(pathname) : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={preserveDetailPane && !active ? `${tab.href}?${SPLIT_PANE_DETAIL_QUERY_KEY}=${SPLIT_PANE_DETAIL_QUERY_VALUE}` : tab.href}
            className={cn(
              'relative inline-flex h-9 flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-cream-700 transition-colors hover:text-cream-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-300/70 md:-mb-px md:h-11 md:flex-none md:rounded-none md:border-b-2 md:border-transparent md:px-5 md:text-base',
              active && 'bg-white text-teal-600 shadow-[0_1px_2px_rgba(31,58,52,0.06)] md:border-ember-500 md:bg-transparent md:text-cream-950 md:shadow-none',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
