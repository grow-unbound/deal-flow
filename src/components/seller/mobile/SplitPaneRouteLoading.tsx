'use client';

import type { ReactNode } from 'react';
import { useParams, usePathname } from 'next/navigation';

import { isSplitPaneDetailPath } from '@/lib/seller-split-pane';

/** Route-level `loading.tsx` helper — suppress full-width landing skeleton on detail URLs. */
export function SplitPaneRouteLoading({
  basePath,
  expandedFallback,
}: {
  basePath: string;
  expandedFallback: ReactNode;
}) {
  const pathname = usePathname();
  const { id } = useParams<{ id?: string }>();

  if (isSplitPaneDetailPath(basePath, pathname, id)) {
    return null;
  }

  return expandedFallback;
}
