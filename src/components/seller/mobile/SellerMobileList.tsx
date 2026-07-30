import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { RealtimeBadge } from '@/components/ui/RealtimeBadge';
import { cn } from '@/lib/utils';

export interface SellerMobileListItem {
  id: string;
  href: string;
  primary: ReactNode;
  trailing?: ReactNode;
  supporting?: ReactNode;
  meta?: ReactNode;
  badge?: 'new' | 'updated';
  onClick?: () => void;
}

interface SellerMobileListProps {
  items: SellerMobileListItem[];
  className?: string;
  emptyState?: ReactNode;
}

export function SellerMobileList({ items, className, emptyState }: SellerMobileListProps) {
  if (items.length === 0 && emptyState) {
    return <div className="md:hidden">{emptyState}</div>;
  }

  return (
    <div className={cn('md:hidden', className)}>
      <div className="flex flex-col gap-2 px-3 py-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            onClick={item.onClick}
            className="block rounded-[12px] border border-cream-200 bg-white px-3.5 py-3 text-left no-underline transition-colors active:bg-cream-100"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 truncate text-[var(--b-text-body)] font-semibold text-cream-900">
                    {item.primary}
                  </p>
                  {item.badge ? <RealtimeBadge type={item.badge} className="shrink-0" /> : null}
                </div>
                {item.supporting ? (
                  <p className="mt-0.5 truncate text-[var(--b-text-body)] text-cream-700">
                    {item.supporting}
                  </p>
                ) : null}
                {item.meta ? (
                  <p className="mt-0.5 truncate text-[var(--b-text-sub)] text-cream-600">
                    {item.meta}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-start gap-1.5">
                {item.trailing ? (
                  <p className="max-w-[8.5rem] truncate text-right text-[var(--b-text-body)] font-semibold text-cream-900">
                    {item.trailing}
                  </p>
                ) : null}
                <ChevronRight className="mt-0.5 h-4 w-4 text-cream-500" aria-hidden />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SellerMobileListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="md:hidden px-3 py-2" role="status" aria-label="Loading list">
      <div className="flex flex-col gap-2">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="rounded-[12px] border border-cream-200 bg-white px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-36 animate-pulse rounded-full bg-cream-200" />
                <div className="h-3 w-48 animate-pulse rounded-full bg-cream-200" />
                <div className="h-3 w-28 animate-pulse rounded-full bg-cream-100" />
              </div>
              <div className="h-4 w-20 animate-pulse rounded-full bg-cream-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
