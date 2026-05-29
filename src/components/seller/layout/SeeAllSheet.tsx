'use client';

import { useMemo, useState, type ReactNode } from 'react';
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
  pageSize = 20,
  renderRow,
}: SeeAllSheetProps<T>) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;

  const { sentinelRef } = useInfiniteScroll({
    hasMore,
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
      <SheetContent side="right" className="max-w-[760px] p-0">
        <SheetHeader>
          <SheetTitle className="font-display text-[22px] font-semibold text-cream-950">{title}</SheetTitle>
          {subtitle ? <p className="mt-1 text-[13px] text-cream-700">{subtitle}</p> : null}
        </SheetHeader>
        <SheetBody className="px-0 py-0">
          <LandingTable columns={columns} className="rounded-none border-0">
            {visibleItems.map((item, index) => renderRow(item, index))}
          </LandingTable>
          {hasMore ? <div ref={sentinelRef} className="h-10" aria-hidden="true" /> : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export type { SeeAllSheetColumn, SeeAllSheetProps };
