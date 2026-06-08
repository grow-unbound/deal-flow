export default function SalesOrderDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 py-6" role="status" aria-label="Loading sales order detail">
      <div className="space-y-4">
        <div className="rounded-[14px] border border-cream-300 bg-white px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-3 w-52 animate-pulse rounded bg-cream-200" />
            <div className="h-7 w-24 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
            <div className="ml-auto flex items-center gap-3">
              <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
              <div className="h-9 w-24 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-64 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-80 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-9 w-28 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            <div className="h-9 w-28 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            <div className="h-9 w-24 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
          </div>
        </div>
        <div className="doc-status-band flex h-10 items-center gap-3 border-b border-cream-300 bg-[var(--bg-recessed)] px-6">
          <div className="h-6 w-20 animate-pulse rounded-full bg-cream-200" />
          <div className="h-3 w-40 animate-pulse rounded bg-cream-200" />
          <div className="ml-auto h-3 w-36 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="border-r border-cream-300 px-4 py-3 last:border-r-0">
              <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
              <div className="mt-3 h-9 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            </div>
          ))}
        </div>
        <div className="grid min-h-[620px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <div className="rounded-[14px] border border-cream-300 bg-white p-4">
            <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
            <div className="mt-2 h-4 w-40 animate-pulse rounded bg-cream-200" />
            <div className="mt-4 h-10 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-[12px] border border-cream-200 bg-cream-100 px-3 py-3">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-cream-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
                    <div className="h-3 w-36 animate-pulse rounded bg-cream-200" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[14px] border border-cream-300 bg-white">
            <div className="border-b border-cream-300 px-5 py-4">
              <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
              <div className="mt-2 h-4 w-64 animate-pulse rounded bg-cream-200" />
            </div>
            <div className="space-y-3 px-4 py-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[40px_minmax(0,1fr)_90px_90px_72px_72px_100px] gap-3">
                  <div className="h-10 animate-pulse rounded bg-cream-200" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-[14px] border border-cream-300 bg-white p-4">
              <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center justify-between gap-4">
                    <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
                    <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[14px] border border-cream-300 bg-white p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
              <div className="mt-4 space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
                    <div className="h-3 w-32 animate-pulse rounded bg-cream-200" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
