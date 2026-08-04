'use client';

import type { ReactNode } from 'react';

import type { SellerSplitListVariant } from '@/lib/seller-split-list-ui';

import { SellerMobileListSkeleton } from './SellerMobileList';
import {
  SellerSplitPaneFilterSkeleton,
  SellerSplitPaneHeaderSkeleton,
  SellerSplitPaneTransactionTabsSkeleton,
} from './SellerSplitPaneSkeletons';

/** Sticky header slot while split-pane list is cold-loading — keeps header/filter chrome visible. */
export function SplitPaneStickyHeaderSlot({
  isPaneOpen,
  showRefreshingState,
  isError,
  showTransactionTabs,
  children,
}: {
  isPaneOpen: boolean;
  showRefreshingState: boolean;
  isError?: boolean;
  showTransactionTabs?: boolean;
  children: ReactNode;
}) {
  if (isPaneOpen && showRefreshingState) {
    return (
      <>
        <SellerSplitPaneHeaderSkeleton />
        {showTransactionTabs ? <SellerSplitPaneTransactionTabsSkeleton /> : null}
        <SellerSplitPaneFilterSkeleton />
      </>
    );
  }

  if (showRefreshingState || isError) {
    return null;
  }

  return children;
}

export function SplitPaneListRowsSkeleton({
  isPaneOpen,
  variant = 'entity',
  count = 6,
  showLeading = false,
}: {
  isPaneOpen: boolean;
  variant?: SellerSplitListVariant;
  count?: number;
  showLeading?: boolean;
}) {
  if (!isPaneOpen) {
    return null;
  }

  return <SellerMobileListSkeleton count={count} forceVisible variant={variant} showLeading={showLeading} />;
}
