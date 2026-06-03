// Stub skeleton matching the order detail page (app/(seller)/orders/[id]/page.tsx)
// Update this when the order detail page is fully implemented.
export default function OrderDetailLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6 space-y-6" role="status" aria-label="Loading order detail">
      {/* Breadcrumb + title row */}
      <div className="space-y-3">
        <div className="h-4 w-40 animate-pulse rounded bg-cream-200" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-[10px] bg-cream-200" />
            <div className="space-y-2">
              <div className="h-7 w-48 animate-pulse rounded bg-cream-200" />
              <div className="h-4 w-72 animate-pulse rounded bg-cream-200" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-24 animate-pulse rounded-[8px] bg-cream-200" />
            <div className="h-9 w-28 animate-pulse rounded-[8px] bg-cream-200" />
          </div>
        </div>
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      {/* Tab pills */}
      <div className="flex items-center gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-cream-200" />
        ))}
      </div>

      {/* Content panel */}
      <div className="h-[28rem] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
    </div>
  );
}
