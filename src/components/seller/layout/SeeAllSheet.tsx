'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LandingTable } from '@/components/seller/layout/LandingTable';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

interface SeeAllSheetColumn {
  label?: string;
  align?: 'left' | 'right';
  width?: number | string;
  className?: string;
}

interface SeeAllSheetProps<T> {
  title: string;
  subtitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: SeeAllSheetColumn[];
  items: T[];
  loading?: boolean;
  pageSize?: number;
  renderRow: (item: T, index: number) => ReactNode;
}

export function SeeAllSheet<T>({
  title,
  subtitle,
  open,
  onOpenChange,
  columns,
  items,
  loading = false,
  pageSize = 20,
  renderRow,
}: SeeAllSheetProps<T>) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;

  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    rootRef: bodyRef,
    onLoadMore: () => setVisibleCount((count) => Math.min(count + pageSize, items.length)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setVisibleCount(pageSize);
      }}
    >
      <SheetContent side="right" className="w-full max-w-[540px] p-0 sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle className="font-display text-xl font-semibold text-cream-950">{title}</SheetTitle>
          {subtitle ? <p className="mt-1 text-base text-cream-700">{subtitle}</p> : null}
        </SheetHeader>
        <SheetBody ref={bodyRef} className="px-0 py-0">
          {loading ? (
            <LandingTable columns={columns} className="rounded-none border-0" tableMinWidth="100%">
              {Array.from({ length: 6 }).map((_, index) => (
                <tr key={index} className="border-b border-cream-200 last:border-b-0">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-[10px]">
                      <div className="h-8 w-8 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-40 animate-pulse rounded bg-cream-100" />
                        <div className="h-3 w-28 animate-pulse rounded bg-cream-100" />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="ml-auto h-4 w-20 animate-pulse rounded bg-cream-100" />
                  </td>
                </tr>
              ))}
            </LandingTable>
          ) : (
            <>
              <LandingTable columns={columns} className="rounded-none border-0" tableMinWidth="100%">
                {visibleItems.map((item, index) => renderRow(item, index))}
              </LandingTable>
              {hasMore ? <div ref={sentinelRef} className="h-10" aria-hidden="true" /> : null}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export type { SeeAllSheetColumn, SeeAllSheetProps };
