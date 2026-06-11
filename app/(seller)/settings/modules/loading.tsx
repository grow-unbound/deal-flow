export default function SettingsModulesLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6" role="status" aria-label="Loading feature modules">
      <div className="space-y-2">
        <div className="h-4 w-28 animate-pulse rounded bg-cream-200" />
        <div className="h-8 w-64 max-w-full animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-cream-200" />
      </div>
      {/* Product defaults card */}
      <div className="max-w-[740px] overflow-hidden rounded-xl border border-cream-200 bg-cream-100">
        <div className="border-b border-cream-200 bg-cream-100 px-5 py-4">
          <div className="h-5 w-40 animate-pulse rounded bg-cream-200" />
          <div className="mt-2 h-3 w-full max-w-md animate-pulse rounded bg-cream-200" />
        </div>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <div className="h-10 animate-pulse rounded border border-cream-200 bg-cream-100" />
          <div className="h-10 animate-pulse rounded border border-cream-200 bg-cream-100" />
        </div>
        <div className="border-t border-cream-200 px-5 py-4">
          <div className="h-3 w-full animate-pulse rounded bg-cream-200" />
        </div>
      </div>
      {/* Three feature module cards */}
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="max-w-[740px] overflow-hidden rounded-xl border border-cream-200 bg-cream-100"
        >
          <div className="flex gap-3 border-b border-cream-200 bg-cream-100 px-5 py-4">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-[10px] bg-cream-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-cream-200" />
              <div className="h-3 w-full max-w-lg animate-pulse rounded bg-cream-200" />
            </div>
            <div className="h-6 w-14 shrink-0 animate-pulse rounded-full bg-cream-200" />
          </div>
          <div className="space-y-0 px-0 py-0">
            <div className="h-16 animate-pulse border-b border-cream-200 bg-cream-100" />
            <div className="h-16 animate-pulse border-b border-cream-200 bg-cream-100" />
            <div className="h-16 animate-pulse bg-cream-100" />
          </div>
        </div>
      ))}
      {/* Save bar */}
      <div className="flex max-w-[740px] justify-end gap-3 pb-4">
        <div className="h-10 w-32 animate-pulse rounded-md bg-cream-200" />
        <div className="h-10 w-28 animate-pulse rounded-md bg-cream-200" />
      </div>
    </div>
  );
}
