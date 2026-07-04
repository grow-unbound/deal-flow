export default function WarehousesLoading() {
  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-5 px-8 py-6" role="status" aria-label="Loading warehouses">
      <div className="space-y-3">
        <div className="h-7 w-44 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-[34rem] animate-pulse rounded bg-cream-200" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      <div className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
