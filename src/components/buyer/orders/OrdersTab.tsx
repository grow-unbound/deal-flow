'use client';

import * as React from 'react';
import { ClipboardList } from 'lucide-react';
import { TransactionCard } from './TransactionCard';
import { OrderRowSkeleton } from './OrderRowSkeleton';
import { useBuyerOrdersInfinite } from '@/hooks/useBuyerOrders';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        padding: '40px 16px',
        textAlign: 'center',
      }}
    >
      <ClipboardList size={48} strokeWidth={1.5} style={{ marginBottom: 16, color: 'var(--fg-3)' }} />
      <p style={{ fontSize: 'var(--b-text-body)', fontWeight: 600, color: 'var(--fg-1)', margin: '0 0 6px' }}>No orders yet</p>
      <p style={{ fontSize: 'var(--b-text-body)', color: 'var(--fg-3)', margin: 0 }}>Your orders will appear here once placed.</p>
    </div>
  );
}

export function OrdersTab() {
  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useBuyerOrdersInfinite();

  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px',
    onLoadMore: fetchNextPage,
  });

  const allOrders = React.useMemo(
    () => data?.pages.flatMap((p) => p.orders) ?? [],
    [data?.pages],
  );

  if (isLoading && !data) {
    return <OrderRowSkeleton count={3} />;
  }

  if (isError && !data) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '40vh',
          padding: '40px 16px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 'var(--b-text-body)', color: 'var(--danger-500)', margin: 0 }}>
          {error instanceof Error ? error.message : 'Failed to load orders'}
        </p>
      </div>
    );
  }

  if (allOrders.length === 0) {
    return <EmptyState />;
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {allOrders.map((order) => (
        <TransactionCard key={order.id} order={order} />
      ))}
      <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
      {isFetchingNextPage && <OrderRowSkeleton count={2} />}
    </div>
  );
}
