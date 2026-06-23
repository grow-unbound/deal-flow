// Mirrors CatalogDetailSkeleton in src/components/seller/catalogs/detail/CatalogDetailPage.tsx
export default function CatalogDetailLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6 space-y-6" role="status" aria-label="Loading catalog detail">
      <div className="h-6 w-56 animate-pulse rounded bg-cream-200" />
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
          <div className="space-y-2">
            <div className="h-7 w-64 animate-pulse rounded bg-cream-200" />
            <div className="h-4 max-w-md animate-pulse rounded bg-cream-200" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 animate-pulse rounded-[8px] bg-cream-200" />
          <div className="h-9 w-36 animate-pulse rounded-[8px] bg-cream-200" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 w-28 animate-pulse rounded-[10px] bg-cream-200" />
        ))}
      </div>

      <div className="h-[28rem] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
    </div>
  );
}
