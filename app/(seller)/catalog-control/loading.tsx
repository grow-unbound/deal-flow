function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[8px] border border-cream-200 bg-cream-100 ${className}`} />
  );
}

function TextSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-cream-200 ${className}`} />;
}

export default function CatalogLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6" role="status" aria-label="Loading catalog">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <TextSkeleton className="h-8 w-40" />
          <TextSkeleton className="h-4 w-[34rem] max-w-full" />
        </div>
        <div className="flex justify-end">
          <SkeletonBlock className="h-10 w-44" />
        </div>
      </div>

      <section className="rounded-[8px] border border-cream-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <TextSkeleton className="h-6 w-16 rounded-full" />
              <TextSkeleton className="h-4 w-48 max-w-full" />
              <TextSkeleton className="h-8 w-8 rounded-[8px]" />
            </div>
            <TextSkeleton className="h-5 w-44" />
            <TextSkeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <SkeletonBlock className="h-[74px] min-w-0 lg:w-60" />
            <SkeletonBlock className="h-[74px] min-w-0 lg:w-60" />
          </div>
        </div>
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-[8px] border border-cream-200 bg-white p-5">
            <div className="space-y-2">
              <TextSkeleton className="h-6 w-36" />
              <TextSkeleton className="h-4 w-44" />
            </div>
            <div className="mt-4 divide-y divide-cream-200 rounded-[8px] border border-cream-200">
              {['w-28', 'w-64', 'w-52', 'w-32'].map((width, index) => (
                <div key={index} className="px-4 py-3">
                  <TextSkeleton className="h-4 w-24" />
                  <TextSkeleton className={`mt-2 h-5 ${width} max-w-full`} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="min-h-[680px] min-w-0">
          <div className="flex h-full min-h-[680px] min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-cream-300 bg-white shadow-sm">
            <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-cream-200 bg-cream-100 px-3 py-2">
              <div className="flex items-center gap-1.5 pr-1">
                <TextSkeleton className="h-3 w-3 rounded-full" />
                <TextSkeleton className="h-3 w-3 rounded-full" />
                <TextSkeleton className="h-3 w-3 rounded-full" />
              </div>
              <TextSkeleton className="h-8 min-w-0 flex-1 rounded-full" />
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-hidden bg-cream-50 p-4">
              <div className="flex items-center gap-3 border-b border-cream-200 pb-4">
                <TextSkeleton className="h-11 w-11 rounded-[10px]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <TextSkeleton className="h-5 w-40 max-w-full" />
                  <TextSkeleton className="h-3 w-20" />
                </div>
              </div>
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-10" />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonBlock key={index} className="aspect-[4/5]" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
