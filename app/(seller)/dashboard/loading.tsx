// Mirrors the dashboard page layout: header + 4 KPI cards + 2 panels + tenant details strip
export default function DashboardLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6" role="status" aria-label="Loading dashboard">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
          <div className="h-8 w-52 animate-pulse rounded-md bg-cream-200" />
          <div className="h-4 w-[32rem] animate-pulse rounded bg-cream-200" />
        </div>
        <div className="flex gap-2 mt-1">
          <div className="h-9 w-28 animate-pulse rounded-[8px] bg-cream-200" />
          <div className="h-9 w-32 animate-pulse rounded-[8px] bg-teal-100" />
        </div>
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-4 gap-[14px] mb-7">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      {/* 2 panels: brand performance + latest orders */}
      <div className="grid grid-cols-2 gap-5 mb-5">
        <div className="animate-pulse rounded-[14px] border border-cream-200 bg-cream-100 p-5 space-y-3">
          <div className="flex justify-between">
            <div className="space-y-1">
              <div className="h-4 w-36 rounded bg-cream-200" />
              <div className="h-3 w-24 rounded bg-cream-200" />
            </div>
            <div className="h-3 w-16 rounded bg-cream-200" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-[8px] bg-cream-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-cream-200" />
                <div className="h-2 rounded-full bg-cream-200" />
              </div>
              <div className="h-3 w-8 rounded bg-cream-200 shrink-0" />
            </div>
          ))}
        </div>
        <div className="animate-pulse rounded-[14px] border border-cream-200 bg-cream-100 p-5 space-y-3">
          <div className="flex justify-between">
            <div className="space-y-1">
              <div className="h-4 w-28 rounded bg-cream-200" />
              <div className="h-3 w-24 rounded bg-cream-200" />
            </div>
            <div className="h-3 w-16 rounded bg-cream-200" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-cream-100">
              <div className="flex-1 space-y-1">
                <div className="h-3 w-20 rounded bg-cream-200" />
                <div className="h-3 w-32 rounded bg-cream-200" />
              </div>
              <div className="h-5 w-16 rounded-full bg-cream-200 shrink-0" />
              <div className="h-3 w-16 rounded bg-cream-200 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Tenant details strip */}
      <div className="animate-pulse rounded-[14px] border border-cream-200 bg-cream-100">
        <div className="px-[22px] py-4 border-b border-cream-200">
          <div className="h-4 w-28 rounded bg-cream-200" />
        </div>
        <div className="px-[22px] py-4 grid grid-cols-3 gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 rounded bg-cream-200" />
              <div className="h-4 w-36 rounded bg-cream-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
