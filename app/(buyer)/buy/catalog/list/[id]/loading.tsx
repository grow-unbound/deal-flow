import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';

function BrowseDetailHeaderSkeleton() {
  return (
    <div
      className="sticky top-0 z-[15] min-h-14 border-b border-cream-200 bg-cream-100/95 px-3 py-2 backdrop-blur-md"
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
    <div className="flex min-h-[50dvh] flex-col pb-[var(--tab-bar)]" role="status" aria-label="Loading">
      <BrowseDetailHeaderSkeleton />
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-2 pb-4 pt-3 sm:grid-cols-[108px_minmax(0,1fr)] sm:gap-4 sm:px-3 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:px-4 lg:pb-6">
        <aside className="min-w-0 border-r border-cream-200 pr-2 sm:pr-3 lg:pt-6 lg:pr-4">
          <div className="sticky top-3 lg:top-[10.5rem]">
            <div className="flex flex-col" aria-label="Loading desktop filters">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex min-h-[88px] flex-col items-center justify-center gap-2 border-b border-cream-200 px-1 py-3 last:border-b-0 sm:min-h-[96px] sm:px-2 lg:min-h-[76px] lg:flex-row lg:items-center lg:justify-start lg:gap-3 lg:px-1">
                  <div className="h-12 w-12 shrink-0 animate-pulse rounded-[10px] border border-cream-200 bg-[var(--bg-surface)] p-1 sm:h-14 sm:w-14 sm:p-1.5 lg:h-16 lg:w-16 lg:rounded-[12px] lg:p-2">
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
