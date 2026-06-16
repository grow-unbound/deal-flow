export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-6 px-8 py-6">
      <div className="space-y-2" role="status" aria-label="Loading settings page">
        <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
        <div className="h-9 w-56 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-cream-200" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-cream-200 bg-cream-50">
          <div className="border-b border-cream-200 px-5 py-4">
            <div className="flex gap-3">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-cream-100" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-cream-200" />
                <div className="h-3 w-full max-w-md animate-pulse rounded bg-cream-200" />
              </div>
            </div>
          </div>
          <div className="space-y-4 px-5 py-5">
            <div className="h-10 w-full animate-pulse rounded-md bg-cream-100" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-10 animate-pulse rounded-md bg-cream-100" />
              <div className="h-10 animate-pulse rounded-md bg-cream-100" />
            </div>
            <div className="h-10 w-full animate-pulse rounded-md bg-cream-100" />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-cream-200 bg-cream-50">
          <div className="border-b border-cream-200 px-5 py-4">
            <div className="flex gap-3">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-cream-100" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
                <div className="h-3 w-full max-w-md animate-pulse rounded bg-cream-200" />
              </div>
            </div>
          </div>
          <div className="space-y-0 px-5 py-2">
            <div className="h-14 animate-pulse border-b border-cream-100 bg-cream-50/50" />
            <div className="h-14 animate-pulse border-b border-cream-100 bg-cream-50/50" />
            <div className="h-14 animate-pulse bg-cream-50/50" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-cream-200 bg-cream-50">
        <div className="border-b border-cream-200 px-5 py-4">
          <div className="flex gap-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-cream-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-52 animate-pulse rounded bg-cream-200" />
              <div className="h-3 w-full max-w-lg animate-pulse rounded bg-cream-200" />
            </div>
          </div>
        </div>
        <div className="space-y-0 px-5 py-2">
          <div className="h-14 animate-pulse border-b border-cream-100 bg-cream-50/50" />
          <div className="h-14 animate-pulse border-b border-cream-100 bg-cream-50/50" />
          <div className="h-14 animate-pulse bg-cream-50/50" />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <div className="h-10 w-28 animate-pulse rounded-md bg-cream-100" />
        <div className="h-10 w-32 animate-pulse rounded-md bg-cream-100" />
      </div>
    </div>
  );
}
