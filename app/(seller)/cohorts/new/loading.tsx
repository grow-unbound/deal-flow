export default function NewCohortLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6" role="status" aria-label="Loading new cohort composer">
      <div className="space-y-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-200" />
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[82px] animate-pulse border-r border-cream-300 bg-white last:border-r-0" />
          ))}
        </div>
        <div className="grid min-h-[620px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <div className="rounded-[14px] border border-cream-300 bg-white animate-pulse" />
          <div className="rounded-[14px] border border-cream-300 bg-white animate-pulse" />
          <div className="rounded-[14px] border border-cream-300 bg-white animate-pulse" />
        </div>
        <div className="sticky bottom-0 h-20 animate-pulse rounded-[14px] border border-cream-300 bg-white" />
      </div>
    </div>
  );
}
