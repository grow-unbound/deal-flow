// Mirrors CustomersLoadingSkeleton in src/components/seller/customers/CustomersLandingClient.tsx
export default function CustomersLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6" role="status" aria-label="Loading customers">
      <div className="space-y-3 mb-5">
        <div className="h-3 w-24 animate-pulse rounded-md bg-cream-200" />
        <div className="h-10 w-52 animate-pulse rounded-md bg-cream-200" />
        <div className="h-4 w-[38rem] animate-pulse rounded-md bg-cream-200" />
        <div className="flex gap-2 pt-1">
          <div className="h-9 w-28 animate-pulse rounded-[8px] bg-cream-200" />
          <div className="h-9 w-32 animate-pulse rounded-[8px] bg-cream-200" />
          <div className="h-9 w-32 animate-pulse rounded-[8px] bg-cream-200" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-52 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="h-14 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100 mb-4" />
      {/* Table skeleton: header row + data rows */}
      <div className="rounded-[14px] border border-cream-200 bg-cream-50 overflow-hidden">
        <div className="grid grid-cols-6 gap-4 px-4 py-3 border-b border-cream-200">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-cream-200" />
          ))}
        </div>
        {Array.from({ length: 7 }).map((_, row) => (
          <div key={row} className="grid grid-cols-6 gap-4 px-4 py-3 border-b border-cream-100">
            {Array.from({ length: 6 }).map((_, col) => (
              <div key={col} className="h-10 animate-pulse rounded-md bg-cream-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
