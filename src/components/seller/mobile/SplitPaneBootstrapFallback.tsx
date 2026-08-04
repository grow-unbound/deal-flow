'use client';

import type { ReactNode } from 'react';
import { useParams, usePathname } from 'next/navigation';

import { isSplitPaneDetailPath } from '@/lib/seller-split-pane';
import type { SellerSplitListVariant } from '@/lib/seller-split-list-ui';

import { SellerSplitPaneLandingSkeleton } from './SellerSplitPaneSkeletons';

export function SplitPaneBootstrapFallback({
  basePath,
  expandedFallback,
  ariaLabel,
  showTransactionTabs = false,
  variant = 'entity',
  showLeading = false,
}: {
  basePath: string;
  expandedFallback: ReactNode;
  ariaLabel: string;
  showTransactionTabs?: boolean;
  variant?: SellerSplitListVariant;
  /** Avatar column in list rows (products, brands, categories). */
  showLeading?: boolean;
}) {
  const pathname = usePathname();
  const { id } = useParams<{ id?: string }>();

  if (isSplitPaneDetailPath(basePath, pathname, id)) {
    return (
      <SellerSplitPaneLandingSkeleton
        ariaLabel={ariaLabel}
        showTransactionTabs={showTransactionTabs}
        variant={variant}
        showLeading={showLeading}
      />
    );
  }

  return expandedFallback;
}
