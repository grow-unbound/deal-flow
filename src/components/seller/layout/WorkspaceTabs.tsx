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
        'mb-5 mt-4 flex min-w-0 items-center gap-3 overflow-x-auto border-b border-cream-300 md:mb-6 md:mt-5',
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
              'inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-1 py-2.5 text-body-sm font-medium text-cream-700 transition-all duration-fast ease-standard hover:text-cream-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-2',
              active && 'border-ember-400 text-cream-900 font-semibold',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
