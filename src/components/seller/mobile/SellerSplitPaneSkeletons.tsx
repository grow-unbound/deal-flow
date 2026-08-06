'use client';

import { PageWrap } from '@/components/seller/layout/PageWrap';
import { StickyListHeader } from '@/components/seller/layout/StickyListHeader';
import { SellerPageHeaderSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import type { SellerSplitListVariant } from '@/lib/seller-split-list-ui';
import { cn } from '@/lib/utils';

import { SellerMobileListSkeleton } from './SellerMobileList';

function PulseLine({ className }: { className: string }) {
  return <div className={cn('animate-pulse rounded-full bg-cream-200', className)} />;
}

export function SellerSplitPaneHeaderSkeleton({
  eyebrowWidth,
  titleWidth,
  subtitleWidth,
}: {
  eyebrowWidth?: string;
  titleWidth?: string;
  subtitleWidth?: string;
}) {
  return (
    <SellerPageHeaderSkeleton
      eyebrowWidth={eyebrowWidth ?? 'w-20'}
      titleWidth={titleWidth ?? 'w-36'}
      subtitleWidth={subtitleWidth ?? 'w-48'}
      actionWidths={['w-9']}
      compact
    />
  );
}

export function SellerSplitPaneTransactionTabsSkeleton() {
  return (
    <div className="mb-0 flex rounded-[10px] bg-cream-200 p-[3px] md:hidden" aria-hidden>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex h-8 flex-1 animate-pulse rounded-lg bg-cream-100" />
      ))}
    </div>
  );
}

export function SellerSplitPaneFilterSkeleton({ compact = true }: { compact?: boolean }) {
  return (
    <div className="flex min-h-[46px] flex-wrap items-center gap-2 border-b border-cream-200 pb-3">
      <div
        className={cn(
          'h-10 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100',
          compact ? 'min-w-0 flex-1' : 'w-full md:min-w-[176px] md:flex-[0_1_220px]',
        )}
      />
      <div className="h-9 w-14 shrink-0 animate-pulse rounded-full bg-cream-100" />
      <div className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-cream-100" />
      <div className="ml-auto h-9 w-28 shrink-0 animate-pulse rounded-full bg-cream-100" />
    </div>
  );
}

/** Split-pane list column bootstrap / cold-load skeleton — header + filter + list rows. */
export function SellerSplitPaneLandingSkeleton({
  ariaLabel,
  showTransactionTabs = false,
  variant = 'entity',
  showLeading = false,
  eyebrowWidth,
  titleWidth,
  subtitleWidth,
}: {
  ariaLabel: string;
  showTransactionTabs?: boolean;
  variant?: SellerSplitListVariant;
  showLeading?: boolean;
  eyebrowWidth?: string;
  titleWidth?: string;
  subtitleWidth?: string;
}) {
  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <div role="status" aria-label={ariaLabel}>
      <StickyListHeader>
        <SellerSplitPaneHeaderSkeleton eyebrowWidth={eyebrowWidth} titleWidth={titleWidth} subtitleWidth={subtitleWidth} />
        {showTransactionTabs ? <SellerSplitPaneTransactionTabsSkeleton /> : null}
        <SellerSplitPaneFilterSkeleton />
      </StickyListHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SellerMobileListSkeleton count={6} forceVisible variant={variant} showLeading={showLeading} />
      </div>
      </div>
    </PageWrap>
  );
}
