// Mirrors CatalogDiscoveryLanding: header + chips + campaigns → brands → categories
export default function CatalogLoading() {
  return (
    <div className="flex flex-col pb-8" role="status" aria-label="Loading catalog">
      <div className="sticky top-0 z-[15] border-b border-cream-200 bg-cream-50/95 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-6">
          <div className="min-w-0">
            <div className="h-2.5 w-14 animate-pulse rounded bg-cream-200" />
            <div className="mt-1.5 h-7 w-28 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-5 w-36 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="px-4 pb-2">
          <div className="h-10 w-full animate-pulse rounded-[12px] bg-cream-200" />
        </div>
        <div className="border-t border-cream-200 px-4 pb-2 pt-2">
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-cream-200" />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-10 px-3 pt-10">
        <section>
          <div className="mb-3 h-5 w-28 animate-pulse rounded bg-cream-200" />
          <div className="-mx-1 flex gap-2 overflow-hidden px-1">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="w-[280px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200">
                <div className="aspect-[15/8] w-full animate-pulse bg-cream-100" />
                <div className="space-y-2 bg-white px-5 py-4">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-cream-200" />
                  <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-3 h-5 w-20 animate-pulse rounded bg-cream-200" />
          <div className="-mx-1 flex gap-3 overflow-hidden px-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-[88px] shrink-0">
                <div className="mx-auto h-[72px] w-[72px] animate-pulse rounded-md bg-cream-100" />
                <div className="mx-auto mt-2 h-3 w-14 animate-pulse rounded bg-cream-200" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-3 h-5 w-24 animate-pulse rounded bg-cream-200" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-[12px] border border-cream-200 bg-[var(--bg-surface)] shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]"
              >
                <div className="aspect-square animate-pulse bg-cream-100" />
                <div className="bg-cream-50 px-3 pb-3 pt-2.5">
                  <div className="h-3.5 w-20 animate-pulse rounded bg-cream-200" />
                  <div className="mt-1.5 h-3 w-14 animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
