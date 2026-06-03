// Mirrors CohortsLandingSkeleton in src/components/seller/cohorts/CohortsLandingClient.tsx
export default function CohortsLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-5" role="status" aria-label="Loading cohorts">
      <div className="h-7 w-44 animate-pulse rounded-md bg-cream-200" />
      <div className="h-4 w-[36rem] animate-pulse rounded-md bg-cream-200" />
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
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[220px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
