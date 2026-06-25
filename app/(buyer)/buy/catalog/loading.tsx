// Mirrors CatalogDiscoveryLanding layout (header + category thumbs + brand scroll + lookbook + grid)
export default function CatalogLoading() {
  return (
    <div className="flex flex-col pb-[var(--tab-bar)]" role="status" aria-label="Loading catalog">
      <div className="sticky top-0 z-[15] border-b border-cream-200 bg-cream-50/95 px-4 pb-3 pt-4 backdrop-blur-md">
        <div className="mb-2 h-3 w-20 animate-pulse rounded bg-cream-200" />
        <div className="mb-3 h-7 w-40 animate-pulse rounded bg-cream-200" />
        <div className="h-10 w-full animate-pulse rounded-xl bg-cream-200" />
      </div>
      <div className="space-y-6 px-3 pt-4">
        <section>
          <div className="mb-2 h-3 w-24 animate-pulse rounded bg-cream-200" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border border-cream-200 px-2 py-3">
                <div className="aspect-square animate-pulse rounded-xl bg-cream-100" />
                <div className="mx-auto h-3 w-12 animate-pulse rounded bg-cream-200" />
                <div className="mx-auto h-2.5 w-6 animate-pulse rounded bg-cream-200" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-2 h-3 w-16 animate-pulse rounded bg-cream-200" />
          <div className="-mx-4 flex gap-3 overflow-hidden px-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-[88px] shrink-0">
                <div className="mx-auto h-[72px] w-[72px] animate-pulse rounded-xl bg-cream-100" />
                <div className="mx-auto mt-2 h-3 w-14 animate-pulse rounded bg-cream-200" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-2 h-3 w-20 animate-pulse rounded bg-cream-200" />
          <div className="-mx-4 flex gap-2 overflow-hidden px-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="w-[200px] shrink-0 overflow-hidden rounded-xl border border-cream-200">
                <div className="h-[90px] animate-pulse bg-cream-100" />
                <div className="h-10 animate-pulse bg-cream-50" />
              </div>
            ))}
          </div>
        </section>
        <div className="grid grid-cols-2 gap-2 pb-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-xl border border-cream-200 bg-cream-50 animate-pulse"
            >
              <div className="relative aspect-square bg-cream-50">
                <div className="absolute right-2 bottom-2 h-8 w-8 rounded-md bg-cream-200" />
              </div>
              <div className="flex flex-col gap-1.5 p-2.5">
                <div className="h-2.5 w-4/5 rounded-full bg-cream-200" />
                <div className="h-2.5 w-3/5 rounded-full bg-cream-200" />
                <div className="mt-0.5 h-4 w-2/5 rounded-full bg-cream-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
