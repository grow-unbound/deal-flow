// Mirrors product detail layout (breadcrumb, title, KPIs, tabs, two-column + secondary grid)
export default function ProductDetailLoading() {
  return (
    <div className="w-full px-4 py-4 md:px-6 md:py-4 space-y-6" role="status" aria-label="Loading product detail">
      <div className="space-y-3">
        <div className="h-4 w-52 animate-pulse rounded bg-cream-200" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
            <div className="space-y-2">
              <div className="h-7 w-56 animate-pulse rounded bg-cream-200" />
              <div className="h-4 w-80 animate-pulse rounded bg-cream-200" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 animate-pulse rounded-[8px] bg-cream-200" />
            <div className="h-9 w-24 animate-pulse rounded-[8px] bg-cream-200" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 w-32 animate-pulse rounded-full bg-cream-200" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="h-[28rem] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        <div className="h-[28rem] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="h-72 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        <div className="h-72 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
      </div>
    </div>
  );
}
