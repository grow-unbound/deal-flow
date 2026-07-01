// Mirrors PriceListsLandingSkeleton in src/components/seller/price-lists/PriceListsLandingClient.tsx
export default function PriceListsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-5 px-8 py-6" role="status" aria-label="Loading price lists">
      <div className="space-y-3">
        <div className="h-7 w-44 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-[40rem] animate-pulse rounded bg-cream-200" />
      </div>

      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-52 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>

      <div className="h-14 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />

      <div className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="grid grid-cols-[1.6fr_1fr_0.7fr_0.8fr_1.05fr_0.85fr_0.85fr_0.8fr_40px] gap-3 border-b border-cream-200 px-5 py-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-cream-200" />
          ))}
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={row} className="grid grid-cols-[1.6fr_1fr_0.7fr_0.8fr_1.05fr_0.85fr_0.85fr_0.8fr_40px] gap-3">
              {Array.from({ length: 8 }).map((_, col) => (
                <div key={col} className="h-10 animate-pulse rounded-md bg-cream-100" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
