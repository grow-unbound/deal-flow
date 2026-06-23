'use client';

import * as React from 'react';
import { FileText } from 'lucide-react';

import { BuyerEmptyState } from '@/components/buyer/BuyerEmptyState';
import { EnquiryCard } from './EnquiryCard';
import { OrderRowSkeleton } from './OrderRowSkeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { useBuyerEstimatesInfinite } from '@/hooks/useEstimates';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

export function EnquiriesTab() {
  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useBuyerEstimatesInfinite();

  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px',
    onLoadMore: fetchNextPage,
  });

  const allEstimates = React.useMemo(
    () => data?.pages.flatMap((p) => p.estimates) ?? [],
    [data?.pages],
  );

  if (isLoading && !data) {
    return <OrderRowSkeleton count={3} />;
  }

  if (isError && !data) {
    return (
      <div className="px-4 py-4">
        <ErrorState
          heading="Couldn't load enquiries"
          description={error instanceof Error ? error.message : 'Could not load enquiries.'}
        />
      </div>
    );
  }

  if (allEstimates.length === 0) {
    return (
      <BuyerEmptyState
        icon={<FileText size={28} strokeWidth={1.5} />}
        heading="No enquiries yet"
        description="Submitted quotes will appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {allEstimates.map((e) => (
        <EnquiryCard key={e.id} estimate={e} />
      ))}
      <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
      {isFetchingNextPage && <OrderRowSkeleton count={2} />}
    </div>
  );
}
