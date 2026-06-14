export default function DashboardLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6" role="status" aria-label="Loading dashboard">
      <div className="mb-7 flex items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
          <div className="h-8 w-44 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-[36rem] animate-pulse rounded bg-cream-200" />
        </div>
        <div className="h-9 w-40 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[210px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-[320px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      <div className="mt-5 rounded-[14px] border border-cream-200 bg-cream-100">
        <div className="border-b border-cream-200 px-5 py-4">
          <div className="h-4 w-28 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-cream-200" />
              <div className="h-4 w-28 animate-pulse rounded bg-cream-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
