// Mirrors LoadingSkeleton in src/components/buyer/catalog/LoadingSkeleton.tsx (cream tokens for route boundary)
export default function CatalogLoading() {
  return (
    <div className="space-y-4 p-4" role="status" aria-label="Loading catalog">
      <div className="h-10 w-full animate-pulse rounded-xl bg-cream-200" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-cream-200" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 pb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-xl border border-cream-200 bg-cream-50 animate-pulse"
          >
            <div className="aspect-square bg-cream-100" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-2 w-1/2 rounded-full bg-cream-200" />
              <div className="h-3 w-4/5 rounded-full bg-cream-200" />
              <div className="h-3 w-3/5 rounded-full bg-cream-200" />
              <div className="mt-1 h-4 w-2/5 rounded-full bg-cream-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
