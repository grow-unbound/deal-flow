'use client';

import { useParams, usePathname } from 'next/navigation';

import { isSplitPaneDetailPath } from '@/lib/seller-split-pane';

/** Stable split-pane open signal — pathname fallback avoids a one-frame `isPaneOpen=false` flash on `/base/[id]`. */
export function useSplitPaneOpen(basePath: string): boolean {
  const pathname = usePathname();
  const { id } = useParams<{ id?: string }>();
  return isSplitPaneDetailPath(basePath, pathname, id);
}
