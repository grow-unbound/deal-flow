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
import {
  matchesEstimateStatusChip,
  type BuyerEstimateStatusChip,
} from '@/lib/buyer-transaction-filters';

interface EnquiriesTabProps {
  search: string;
  statusFilter: BuyerEstimateStatusChip;
  highlightId?: string | null;
  sellerPreview?: boolean;
}

export function EnquiriesTab({
  search,
  statusFilter,
  highlightId,
  sellerPreview = false,
}: EnquiriesTabProps) {
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

  const sentinelIndex = getSentinelInsertIndex(visibleEstimates.length);
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    onLoadMore: () => { void fetchNextPage(); },
  });

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
            <p className="text-[var(--b-text-body)] font-medium text-[var(--cream-600)]">
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
