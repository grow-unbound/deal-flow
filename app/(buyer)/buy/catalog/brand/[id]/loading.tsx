import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col pb-[var(--tab-bar)]" role="status" aria-label="Loading">
      <div className="flex items-center gap-2 border-b border-[var(--border-1)] bg-[var(--bg-base)]/95 px-3 py-2.5 backdrop-blur-md">
        <div className="h-9 w-9 animate-pulse rounded-full bg-cream-200" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-1 h-3 w-32 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="h-9 w-9 animate-pulse rounded-full bg-cream-200" />
      </div>
      <div className="px-3 pt-2">
        <div className="h-10 w-full animate-pulse rounded-full border border-cream-200 bg-cream-100" />
      </div>
      <div className="pt-3">
        <LoadingSkeleton count={6} />
      </div>
    </div>
  );
}
