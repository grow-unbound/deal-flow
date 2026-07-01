export default function LocationDetailLoading() {
  return (
    <div
      className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6 space-y-6"
      role="status"
      aria-label="Loading location detail"
    >
      <div className="space-y-3">
        <div className="h-4 w-52 animate-pulse rounded bg-cream-200" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
            <div className="space-y-2">
              <div className="h-7 w-56 animate-pulse rounded bg-cream-200" />
              <div className="h-4 max-w-md animate-pulse rounded bg-cream-200" />
            </div>
          </div>
          <div className="h-9 w-20 animate-pulse rounded-[8px] bg-cream-200" />
        </div>
      </div>

      <div className="rounded-[14px] border border-cream-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-cream-200" />
              <div className="h-5 w-40 animate-pulse rounded bg-cream-200" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-cream-200" />
        ))}
      </div>

      <div className="h-[26rem] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
    </div>
  );
}
