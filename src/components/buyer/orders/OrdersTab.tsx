'use client';

import * as React from 'react';
import { Fragment } from 'react';
import { ClipboardList } from 'lucide-react';

import { ErrorState } from '@/components/ui/empty-state';
import { RealtimeBadge } from '@/components/ui/RealtimeBadge';
import { TransactionCard, type OrderSummary } from './TransactionCard';
import { BuyerTransactionCardSkeleton } from './BuyerTransactionCardSkeleton';
import { useBuyerOrdersInfinite } from '@/hooks/useBuyerOrders';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import {
  matchesOrderStatusChip,
  type BuyerOrderStatusChip,
} from '@/lib/buyer-transaction-filters';

interface OrdersTabProps {
  search: string;
  statusFilter: BuyerOrderStatusChip;
  sellerPreview?: boolean;
  updatedEntityIds?: Map<string, 'new' | 'updated'>;
  onMarkSeen?: (id: string) => void;
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="px-4 pt-3">
      <div className="rounded-[12px] border border-[var(--border-1)] bg-white px-4 py-5 text-center">
        <ClipboardList size={40} strokeWidth={1.5} className="mx-auto mb-3 text-[var(--cream-500)]" />
        <p className="text-[var(--b-text-body)] font-medium text-[var(--cream-600)]">
          {search ? `No orders matching "${search}"` : 'No orders yet.'}
        </p>
      </div>
    </div>
  );
}

export function OrdersTab({
  search,
  statusFilter,
  sellerPreview = false,
  updatedEntityIds,
  onMarkSeen,
}: OrdersTabProps) {
  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useBuyerOrdersInfinite();

  const allOrders = React.useMemo(
    () => data?.pages.flatMap((p) => p.orders) ?? [],
    [data?.pages],
  );

  const q = search.trim().toLowerCase();
  const visibleOrders = React.useMemo(() => {
    return allOrders.filter((o) => {
      if (!matchesOrderStatusChip(o.status, statusFilter)) return false;
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q)
        || (o.catalog_name ?? '').toLowerCase().includes(q)
        || o.status.toLowerCase().includes(q)
      );
    });
  }, [allOrders, q, statusFilter]);

  const sentinelIndex = getSentinelInsertIndex(visibleOrders.length);
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
          heading="Couldn't load orders"
          description={error instanceof Error ? error.message : 'Failed to load orders'}
        />
      </div>
    );
  }

  if (visibleOrders.length === 0) {
    return <EmptyState search={search} />;
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {visibleOrders.map((o, index) => {
        const orderSummary: OrderSummary = {
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          total_amount: o.total_amount,
          placed_at: o.placed_at,
          item_count: o.items_count,
          description: o.catalog_name || 'Order',
        };
        const orderTag = updatedEntityIds?.get(o.id);
        return (
          <Fragment key={o.id}>
            <div onClick={() => onMarkSeen?.(o.id)}>
              {orderTag ? <RealtimeBadge type={orderTag} /> : null}
              <TransactionCard order={orderSummary} href={`/buy/orders/${o.id}`} />
            </div>
            {index === sentinelIndex ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
          </Fragment>
        );
      })}
      {isFetchingNextPage ? <BuyerTransactionCardSkeleton count={2} /> : null}
    </div>
  );
}
