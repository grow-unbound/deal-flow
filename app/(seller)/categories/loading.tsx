// Mirrors CategoriesLoadingSkeleton in src/components/seller/categories/CategoriesLandingClient.tsx
export default function CategoriesLoading() {
  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-5 px-8 py-6" role="status" aria-label="Loading categories">
      <div className="h-24 animate-pulse rounded-[12px] bg-cream-100" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[190px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="h-[46px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="grid grid-cols-[1.8fr_0.9fr_0.9fr_0.9fr_0.9fr_40px] gap-3 border-b border-cream-200 px-5 py-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-cream-200" />
          ))}
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={row} className="grid grid-cols-[1.8fr_0.9fr_0.9fr_0.9fr_0.9fr_40px] gap-3">
              {Array.from({ length: 5 }).map((_, col) => (
                <div key={col} className="h-10 animate-pulse rounded-md bg-cream-100" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
