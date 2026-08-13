'use client';

import * as React from 'react';
import { Fragment } from 'react';
import { FileText } from 'lucide-react';

import { BuyerEmptyState } from '@/components/buyer/BuyerEmptyState';
import { EnquiryCard } from './EnquiryCard';
import { BuyerTransactionCardSkeleton } from './BuyerTransactionCardSkeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { useBuyerEstimatesInfinite } from '@/hooks/useEstimates';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { BUYER_INFINITE_SCROLL_RATIO } from '@/lib/buyer-ui';
import {
  matchesEstimateStatusChip,
  type BuyerEstimateStatusChip,
} from '@/lib/buyer-transaction-filters';

interface EnquiriesTabProps {
  search: string;
  statusFilter: BuyerEstimateStatusChip;
  highlightId?: string | null;
  sellerPreview?: boolean;
  desktopSelectedId?: string | null;
  onDesktopSelect?: (id: string) => void;
  desktopMode?: boolean;
}

export function EnquiriesTab({
  search,
  statusFilter,
  highlightId,
  sellerPreview = false,
  desktopSelectedId,
  onDesktopSelect,
  desktopMode = false,
}: EnquiriesTabProps) {
  const listRootRef = React.useRef<HTMLDivElement | null>(null);
  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useBuyerEstimatesInfinite();

  const allEstimates = React.useMemo(() => {
    const rows = data?.pages.flatMap((p) => p.estimates) ?? [];
    if (highlightId && !rows.find((e) => e.id === highlightId)) {
      return [
        {
          id: highlightId,
          estimate_number: null,
          status: 'draft',
          total_amount: 0,
          created_at: new Date().toISOString(),
          notes: 'New inquiry submitted',
        },
        ...rows,
      ];
    }
    return rows;
  }, [data?.pages, highlightId]);

  const q = search.trim().toLowerCase();
  const visibleEstimates = React.useMemo(() => {
    return allEstimates.filter((e) => {
      if (!matchesEstimateStatusChip(e.status, statusFilter)) return false;
      if (!q) return true;
      return (
        (e.estimate_number ?? '').toLowerCase().includes(q)
        || (e.notes ?? '').toLowerCase().includes(q)
        || e.status.toLowerCase().includes(q)
      );
    });
  }, [allEstimates, q, statusFilter]);

  const sentinelIndex = getSentinelInsertIndex(visibleEstimates.length, BUYER_INFINITE_SCROLL_RATIO);
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootRef: desktopMode ? listRootRef : undefined,
    onLoadMore: () => { void fetchNextPage(); },
  });

  const desktopSelectedEstimate = desktopSelectedId
    ? visibleEstimates.find((estimate) => estimate.id === desktopSelectedId) ?? visibleEstimates[0]
    : visibleEstimates[0];

  React.useEffect(() => {
    if (!desktopMode || !onDesktopSelect || visibleEstimates.length === 0) return;
    if (!desktopSelectedId || !visibleEstimates.some((estimate) => estimate.id === desktopSelectedId)) {
      onDesktopSelect(visibleEstimates[0]!.id);
    }
  }, [desktopMode, desktopSelectedId, onDesktopSelect, visibleEstimates]);

  if (sellerPreview) return null;

  if (isLoading && !data) {
    return <BuyerTransactionCardSkeleton count={5} />;
  }

  if (isError && !data) {
    return (
      <div className="px-4 py-4">
        <ErrorState
          heading="Couldn't load enquiries"
          description={error instanceof Error ? error.message : 'Failed to load enquiries'}
        />
      </div>
    );
  }

  if (visibleEstimates.length === 0) {
    return (
      <div className="px-4 pt-3">
        {search ? (
          <div className="rounded-[12px] border border-[var(--border-1)] bg-white px-4 py-5 text-center">
            <p className="text-[var(--b-text-body)] font-medium">
              {`No enquiries matching "${search}"`}
            </p>
          </div>
        ) : (
          <BuyerEmptyState
            icon={<FileText size={28} strokeWidth={1.5} />}
            heading="No enquiries yet"
            description="Submitted quotes will appear here."
          />
        )}
      </div>
    );
  }

  if (desktopMode && onDesktopSelect) {
    return (
      <div ref={listRootRef} className="h-full overflow-y-auto pr-3">
        <div className="flex flex-col">
          {visibleEstimates.map((estimate, index) => (
            <Fragment key={estimate.id}>
              <button
                type="button"
                onClick={() => onDesktopSelect(estimate.id)}
                className="text-left transition-colors"
              >
                <EnquiryCard
                  estimate={estimate}
                  highlighted={highlightId === estimate.id}
                  variant="rail"
                  selected={desktopSelectedEstimate?.id === estimate.id}
                />
              </button>
              {index === sentinelIndex ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
            </Fragment>
          ))}
          {isFetchingNextPage ? <BuyerTransactionCardSkeleton count={2} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {visibleEstimates.map((e, index) => (
        <Fragment key={e.id}>
          <EnquiryCard
            estimate={e}
            href={`/buy/estimates/${e.id}`}
            highlighted={highlightId === e.id}
          />
          {index === sentinelIndex ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
        </Fragment>
      ))}
      {isFetchingNextPage ? <BuyerTransactionCardSkeleton count={2} /> : null}
    </div>
  );
}
