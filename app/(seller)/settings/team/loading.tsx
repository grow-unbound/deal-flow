export default function TeamLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6">
      <div className="space-y-6" role="status" aria-label="Loading team page">
        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
          <div className="h-9 w-40 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-[32rem] max-w-full animate-pulse rounded bg-cream-200" />
        </div>

        <div className="w-full rounded-xl border border-cream-200 bg-cream-100 p-5">
          <div className="mb-4 flex gap-3">
            <div className="h-9 w-48 animate-pulse rounded border border-cream-200 bg-cream-100" />
            <div className="h-9 w-28 animate-pulse rounded border border-cream-200 bg-cream-100" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded border border-cream-200 bg-cream-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
