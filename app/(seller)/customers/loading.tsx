// Mirrors CustomersLoadingSkeleton in src/components/seller/customers/CustomersLandingClient.tsx
export default function CustomersLoading() {
  return (
    <div className="mx-auto w-full max-w-[1920px] px-8 py-6" role="status" aria-label="Loading customers">
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-6">
          <div className="space-y-3">
            <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
            <div className="h-10 w-52 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-28 animate-pulse rounded-[8px] bg-cream-200" />
            <div className="h-9 w-32 animate-pulse rounded-[8px] bg-cream-200" />
          </div>
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
          <div className="grid grid-cols-[1.8fr_1.1fr_1.25fr_0.9fr_0.8fr_0.95fr_0.8fr_0.9fr_0.9fr_40px] gap-3 border-b border-cream-200 px-5 py-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-cream-200" />
            ))}
          </div>
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, row) => (
              <div key={row} className="grid grid-cols-[1.8fr_1.1fr_1.25fr_0.9fr_0.8fr_0.95fr_0.8fr_0.9fr_0.9fr_40px] gap-3">
                {Array.from({ length: 9 }).map((_, col) => (
                  <div key={col} className="h-10 animate-pulse rounded-md bg-cream-100" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
