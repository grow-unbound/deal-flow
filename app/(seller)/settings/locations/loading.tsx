export default function SettingsLocationsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-6 px-8 py-6">
      <div className="mb-7 flex items-end justify-between gap-6">
        <div className="space-y-2" role="status" aria-label="Loading locations settings">
          <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
          <div className="h-9 w-44 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded bg-cream-200" />
        </div>
        <div className="h-9 w-36 animate-pulse rounded-md border border-cream-200 bg-cream-100" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cream-200 bg-cream-50 px-4 py-3">
        <div className="h-4 w-36 animate-pulse rounded bg-cream-200" />
        <div className="h-8 w-28 animate-pulse rounded-md border border-cream-200 bg-cream-100" />
      </div>

      <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-max border-b border-cream-300 bg-white px-5 py-3">
            <div className="grid grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-cream-200" />
              ))}
            </div>
          </div>
          {Array.from({ length: 5 }).map((_, r) => (
            <div key={r} className="flex min-w-max border-b border-cream-300 px-5 py-3 last:border-0">
              <div className="h-10 flex-1 animate-pulse rounded border border-cream-200 bg-cream-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
