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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 pt-4 md:px-8 md:pt-0">
        <div className="h-6 w-28 animate-pulse rounded-full bg-cream-200 md:hidden" />
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

/** Mobile stacked entry screens (entry, dues, quote): heading, body blocks, pinned footer. */
export function InboxEntryScreenSkeleton() {
  return (
    <div className="flex min-h-[calc(100dvh-var(--topbar-h))] flex-col" role="status" aria-label="Loading">
      <div className="flex-1 space-y-5 px-4 py-5">
        <div className="space-y-2">
          <div className="h-6 w-44 animate-pulse rounded-full bg-cream-200" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded-full bg-cream-200" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-32 animate-pulse rounded-full bg-cream-200" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
          ))}
        </div>
      </div>
      <div className="sticky bottom-0 border-t border-cream-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="h-8 w-16 animate-pulse rounded-full bg-cream-200" />
          <div className="flex gap-2">
            <div className="h-10 w-24 animate-pulse rounded-[10px] bg-cream-200" />
            <div className="h-10 w-28 animate-pulse rounded-[10px] bg-cream-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
