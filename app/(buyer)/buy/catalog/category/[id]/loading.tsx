import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';

function BrowseDetailHeaderSkeleton() {
  return (
    <div
      className="sticky top-0 z-[15] border-b border-cream-200 bg-cream-100"
      aria-hidden
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-10 w-10 shrink-0 animate-pulse bg-cream-200" />
        <div className="h-5 min-w-0 flex-1 animate-pulse rounded bg-cream-200" />
      </div>
      <div className="border-t border-cream-200 px-4 py-2.5">
        <div className="h-11 w-full animate-pulse rounded-[12px] bg-cream-200" />
      </div>
      <div className="border-t border-cream-200 px-4 py-2">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-cream-200" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex min-h-[50dvh] flex-col pb-8" role="status" aria-label="Loading">
      <BrowseDetailHeaderSkeleton />
      <div className="px-2 pt-3">
        <LoadingSkeleton count={6} />
      </div>
    </div>
  );
}
