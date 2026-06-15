// Mirrors buyer home page: greeting + 2×2 KPI grid + horizontal scroll sections + product grid
export default function HomeLoading() {
  return (
    <div className="p-4 space-y-4" role="status" aria-label="Loading home">
      {/* Greeting */}
      <div className="h-6 w-40 animate-pulse rounded-md bg-cream-200" />

      {/* 2×2 KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        ))}
      </div>

      {/* Section label + horizontal scroll */}
      <div className="h-5 w-32 animate-pulse rounded-md bg-cream-200" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 w-36 shrink-0 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        ))}
      </div>

      {/* Section label + catalog cards (horizontal scroll) */}
      <div className="h-5 w-28 animate-pulse rounded-md bg-cream-200" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 w-44 shrink-0 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        ))}
      </div>

      {/* Section label + product grid */}
      <div className="h-5 w-32 animate-pulse rounded-md bg-cream-200" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
