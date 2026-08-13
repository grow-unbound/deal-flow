'use client';

import * as React from 'react';
import { Fragment } from 'react';
import { Receipt } from 'lucide-react';

import { BuyerEmptyState } from '@/components/buyer/BuyerEmptyState';
import { InvoiceCard } from './InvoiceCard';
import { BuyerTransactionCardSkeleton, TransactionCardSkeletonItem } from './BuyerTransactionCardSkeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { useBuyerInvoicesInfinite } from '@/hooks/useBuyerInvoices';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { BUYER_INFINITE_SCROLL_RATIO } from '@/lib/buyer-ui';
import {
  matchesInvoiceStatusChip,
  type BuyerInvoiceStatusChip,
} from '@/lib/buyer-transaction-filters';

interface InvoicesTabProps {
  search: string;
  statusFilter: BuyerInvoiceStatusChip;
  sellerPreview?: boolean;
  desktopSelectedId?: string | null;
  onDesktopSelect?: (id: string) => void;
  desktopMode?: boolean;
}

export function InvoicesTab({
  search,
  statusFilter,
  sellerPreview = false,
  desktopSelectedId,
  onDesktopSelect,
  desktopMode = false,
}: InvoicesTabProps) {
  const listRootRef = React.useRef<HTMLDivElement | null>(null);
  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useBuyerInvoicesInfinite();

  const allInvoices = React.useMemo(
    () => data?.pages.flatMap((p) => p.invoices) ?? [],
    [data?.pages],
  );

  const q = search.trim().toLowerCase();
  const visibleInvoices = React.useMemo(() => {
    return allInvoices.filter((inv) => {
      if (!matchesInvoiceStatusChip(inv, statusFilter)) return false;
      if (!q) return true;
      return inv.invoice_number.toLowerCase().includes(q) || inv.status.toLowerCase().includes(q);
    });
  }, [allInvoices, q, statusFilter]);

  const sentinelIndex = getSentinelInsertIndex(visibleInvoices.length, BUYER_INFINITE_SCROLL_RATIO);
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootRef: desktopMode ? listRootRef : undefined,
    onLoadMore: () => { void fetchNextPage(); },
  });

  const desktopSelectedInvoice = desktopSelectedId
    ? visibleInvoices.find((invoice) => invoice.id === desktopSelectedId) ?? visibleInvoices[0]
    : visibleInvoices[0];

  React.useEffect(() => {
    if (!desktopMode || !onDesktopSelect || visibleInvoices.length === 0) return;
    if (!desktopSelectedId || !visibleInvoices.some((invoice) => invoice.id === desktopSelectedId)) {
      onDesktopSelect(visibleInvoices[0]!.id);
    }
  }, [desktopMode, desktopSelectedId, onDesktopSelect, visibleInvoices]);

  if (sellerPreview) return null;

  if (isLoading && !data) {
    return <BuyerTransactionCardSkeleton count={5} />;
  }

  if (isError && !data) {
    return (
      <div className="px-4 py-4">
        <ErrorState
          heading="Couldn't load invoices"
          description={error instanceof Error ? error.message : 'Failed to load invoices'}
        />
      </div>
    );
  }

  if (visibleInvoices.length === 0) {
    return (
      <div className="px-4 pt-3">
        {search ? (
          <div className="rounded-[12px] border border-[var(--border-1)] bg-white px-4 py-5 text-center">
            <p className="text-[var(--b-text-body)] font-medium text-[var(--cream-600)]">
              {`No invoices matching "${search}"`}
            </p>
          </div>
        ) : statusFilter !== 'All' ? (
          <div className="rounded-[12px] border border-[var(--border-1)] bg-white px-4 py-5 text-center">
            <p className="text-[var(--b-text-body)] font-medium text-[var(--cream-600)]">
              {`No ${statusFilter.toLowerCase()} invoices.`}
            </p>
          </div>
        ) : (
          <BuyerEmptyState
            icon={<Receipt size={28} strokeWidth={1.5} />}
            heading="No invoices yet"
            description="Invoices from your distributor will appear here."
          />
        )}
      </div>
    );
  }

  if (desktopMode && onDesktopSelect) {
    return (
      <div ref={listRootRef} className="h-full overflow-y-auto pr-3">
        <div className="flex flex-col">
          {visibleInvoices.map((invoice, index) => (
            <Fragment key={invoice.id}>
              <button
                type="button"
                onClick={() => onDesktopSelect(invoice.id)}
                className="text-left transition-colors"
              >
                <InvoiceCard invoice={invoice} variant="rail" selected={desktopSelectedInvoice?.id === invoice.id} />
              </button>
              {index === sentinelIndex ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
            </Fragment>
          ))}
          {isFetchingNextPage ? (
            <>
              <TransactionCardSkeletonItem />
              <TransactionCardSkeletonItem />
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {visibleInvoices.map((inv, index) => (
        <Fragment key={inv.id}>
          <InvoiceCard invoice={inv} href={`/buy/invoices/${inv.id}`} />
          {index === sentinelIndex ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
        </Fragment>
      ))}
      {isFetchingNextPage ? (
            <>
              <TransactionCardSkeletonItem />
              <TransactionCardSkeletonItem />
            </>
          ) : null}
    </div>
  );
}
