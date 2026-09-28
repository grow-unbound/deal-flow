export function InboxDetailSkeleton() {
  return (
    <div className="mx-auto flex h-full w-full max-w-[1920px] flex-col" role="status" aria-label="Loading">
      <div className="hidden shrink-0 px-4 py-4 md:block md:px-6 md:py-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-[14px] bg-cream-200" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-5 w-48 animate-pulse rounded-full bg-cream-200" />
            <div className="h-3.5 w-32 animate-pulse rounded-full bg-cream-200" />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 md:px-8">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-[14px] border border-cream-300 bg-white px-6 py-5">
            <div className="h-4 w-40 animate-pulse rounded-full bg-cream-200" />
            <div className="mt-2 h-3.5 w-24 animate-pulse rounded-full bg-cream-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
