import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';
import {
  BUYER_DETAIL_RAIL_GRID_CLASS,
  BUYER_DETAIL_RAIL_ITEM_CLASS,
  BUYER_DETAIL_RAIL_THUMB_CLASS,
} from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';

function BrowseDetailHeaderSkeleton() {
  return (
    <div
      className="sticky top-0 z-[15] min-h-14 border-b border-cream-200 bg-[var(--bg-surface)] px-3 py-2 backdrop-blur-md"
      aria-hidden
    >
      <div className="flex h-full min-h-10 items-center gap-2">
        <div className="h-10 w-10 shrink-0 animate-pulse bg-cream-200" />
        <div className="h-5 min-w-0 flex-1 animate-pulse rounded bg-cream-200" />
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex min-h-[50dvh] flex-col" role="status" aria-label="Loading">
      <BrowseDetailHeaderSkeleton />
      <div className={cn(BUYER_DETAIL_RAIL_GRID_CLASS, 'pt-3 pb-0 lg:pb-0')}>
        <aside className="min-w-0 border-r border-cream-200 pr-1.5 sm:pr-3 lg:pt-6 lg:pr-4">
          <div className="sticky top-3 lg:top-[10.5rem]">
            <div className="flex flex-col" aria-label="Loading desktop filters">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={cn(BUYER_DETAIL_RAIL_ITEM_CLASS, 'border-b border-cream-200 last:border-b-0')}>
                  <div className={cn(BUYER_DETAIL_RAIL_THUMB_CLASS, 'shrink-0 animate-pulse rounded-[10px] border border-cream-200 bg-[var(--bg-surface)] lg:rounded-[12px]')}>
                    <div className="h-full w-full rounded-[8px] bg-cream-200 lg:rounded-[10px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-14 animate-pulse rounded bg-cream-200 lg:w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <div className="px-2">
          <div className="mx-0 mb-3 rounded-[12px] border border-cream-200 bg-cream-100 p-4">
            <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-cream-200" />
          </div>
          <LoadingSkeleton count={10} />
        </div>
      </div>
    </div>
  );
}
