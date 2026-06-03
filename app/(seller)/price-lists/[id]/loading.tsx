// Mirrors the inline loading skeleton in app/(seller)/price-lists/[id]/page.tsx
export default function PriceListDetailLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-10 space-y-6" role="status" aria-label="Loading price list detail">
      {/* Breadcrumb */}
      <div className="h-5 w-52 animate-pulse rounded bg-cream-200" />

      {/* Title + action button */}
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="h-12 w-96 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-[540px] animate-pulse rounded bg-cream-200" />
        </div>
        <div className="h-10 w-56 animate-pulse rounded-[8px] bg-cream-200" />
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[112px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      {/* Tab / filter bar */}
      <div className="h-12 w-full animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />

      {/* List rows */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
