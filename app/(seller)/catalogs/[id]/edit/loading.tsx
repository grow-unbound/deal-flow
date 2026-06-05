export default function EditCatalogLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6" role="status" aria-label="Loading edit catalog composer">
      <div className="space-y-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-32 animate-pulse rounded-[9px] bg-cream-100 border border-cream-200" />
            <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-100 border border-cream-200" />
          </div>
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-200 bg-white lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[82px] animate-pulse border-r border-cream-200 bg-white last:border-r-0" />
          ))}
        </div>
        <div className="grid min-h-[620px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <div className="rounded-[14px] border border-cream-200 bg-white animate-pulse" />
          <div className="rounded-[14px] border border-cream-200 bg-white animate-pulse" />
          <div className="rounded-[14px] border border-cream-200 bg-white animate-pulse" />
        </div>
        <div className="sticky bottom-0 h-20 rounded-[14px] border border-cream-200 bg-white animate-pulse" />
      </div>
    </div>
  );
}
