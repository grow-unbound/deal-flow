'use client';

import { useParams, usePathname, useSearchParams } from 'next/navigation';

import {
  isSplitPaneDetailPath,
  isSplitPaneDetailQuery,
  SPLIT_PANE_DETAIL_QUERY_KEY,
} from '@/lib/seller-split-pane';

/** Stable split-pane open signal — pathname fallback avoids a one-frame `isPaneOpen=false` flash on `/base/[id]`. */
export function useSplitPaneOpen(basePath: string): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { id } = useParams<{ id?: string }>();
  return isSplitPaneDetailPath(basePath, pathname, id)
    || (pathname === basePath && isSplitPaneDetailQuery(searchParams.get(SPLIT_PANE_DETAIL_QUERY_KEY)));
}
