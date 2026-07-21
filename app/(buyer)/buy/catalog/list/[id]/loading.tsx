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
      <div className="pt-3 px-2">
        <div className="mx-0 mb-3 rounded-[12px] border border-cream-200 bg-cream-100 p-4">
          <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-cream-200" />
        </div>
        <LoadingSkeleton count={6} />
      </div>
    </div>
  );
}
