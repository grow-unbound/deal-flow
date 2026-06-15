export default function SettingsCategoriesLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6">
      <div className="flex items-end justify-between gap-6 border-b border-transparent px-0 pt-6 pb-0">
        <div className="space-y-2" role="status" aria-label="Loading categories settings">
          <div className="h-4 w-28 animate-pulse rounded bg-cream-200" />
          <div className="h-9 w-48 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded bg-cream-200" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-md border border-cream-200 bg-cream-100" />
      </div>

      <section className="overflow-hidden rounded-xl border border-cream-200 bg-cream-100">
        <header className="border-b border-cream-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-40 animate-pulse rounded bg-cream-200" />
              <div className="h-4 w-full max-w-md animate-pulse rounded bg-cream-200" />
            </div>
          </div>
        </header>
        <div className="space-y-4 px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cream-200 bg-cream-100 px-4 py-3">
            <div className="h-4 w-36 animate-pulse rounded bg-cream-200" />
            <div className="h-8 w-32 animate-pulse rounded-md border border-cream-200 bg-cream-100" />
          </div>
          <div className="overflow-hidden rounded-lg border border-cream-200">
            <div className="grid grid-cols-4 gap-0 border-b border-cream-200 bg-cream-100 px-5 py-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-cream-200" />
              ))}
            </div>
            {Array.from({ length: 4 }).map((_, r) => (
              <div key={r} className="flex border-b border-cream-200 px-5 py-3 last:border-0">
                <div className="h-10 flex-1 animate-pulse rounded border border-cream-200 bg-cream-100" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
