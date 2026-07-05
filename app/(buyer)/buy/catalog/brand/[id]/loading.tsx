import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';

function BrowseDetailHeaderSkeleton() {
  return (
    <div
      className="sticky top-0 z-[15] border-b border-cream-200 bg-cream-100/95 backdrop-blur-md"
      aria-hidden
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className="h-8 w-8 animate-pulse bg-cream-200" />
        <div className="h-5 min-w-0 flex-1 animate-pulse rounded bg-cream-200" />
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
      </div>
      <div className="border-t border-cream-200 px-4 pb-2 pt-2">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-cream-200" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col pb-8" role="status" aria-label="Loading">
      <BrowseDetailHeaderSkeleton />
      <div className="px-2 pt-3">
        <LoadingSkeleton count={6} />
      </div>
    </div>
  );
}
