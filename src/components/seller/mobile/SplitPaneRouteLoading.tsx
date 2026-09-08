'use client';

import type { ReactNode } from 'react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';

import { PageWrap } from '@/components/seller/layout/PageWrap';
import {
  isSplitPaneDetailPath,
  isSplitPaneDetailQuery,
  SPLIT_PANE_DETAIL_QUERY_KEY,
} from '@/lib/seller-split-pane';

import { SellerMobileListSkeleton } from './SellerMobileList';

/** Route-level `loading.tsx` helper — suppress full-width landing skeleton on detail URLs. */
export function SplitPaneRouteLoading({
  basePath,
  expandedFallback,
  listOnly = false,
}: {
  basePath: string;
  expandedFallback: ReactNode;
  listOnly?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { id } = useParams<{ id?: string }>();

  if (isSplitPaneDetailPath(basePath, pathname, id)) {
    return null;
  }

  if (pathname === basePath && isSplitPaneDetailQuery(searchParams.get(SPLIT_PANE_DETAIL_QUERY_KEY))) {
    return <SplitPaneListBodyLoading />;
  }

  if (listOnly) {
    return <SplitPaneListBodyLoading />;
  }

  return expandedFallback;
}

function SplitPaneListBodyLoading() {
  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto" role="status" aria-label="Loading selected tab list">
        <SellerMobileListSkeleton count={6} forceVisible />
      </div>
    </PageWrap>
  );
}
