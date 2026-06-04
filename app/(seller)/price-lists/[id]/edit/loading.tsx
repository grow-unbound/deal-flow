export default function EditPriceListLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6" role="status" aria-label="Loading edit price list composer">
      <div className="rounded-[22px] border border-cream-200 bg-white">
        <div className="h-16 animate-pulse border-b border-cream-200 bg-cream-100" />
        <div className="space-y-5 border-b border-cream-200 px-6 py-5">
          <div className="h-10 w-72 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-[44rem] animate-pulse rounded bg-cream-200" />
          <div className="grid gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[108px] animate-pulse rounded-[16px] border border-cream-200 bg-cream-100" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[280px_minmax(0,1fr)_320px]">
          <div className="min-h-[560px] animate-pulse border-r border-cream-200 bg-cream-100" />
          <div className="min-h-[560px] animate-pulse bg-white" />
          <div className="min-h-[560px] animate-pulse border-l border-cream-200 bg-cream-100" />
        </div>
        <div className="h-20 animate-pulse border-t border-cream-200 bg-cream-50" />
      </div>
    </div>
  );
}
