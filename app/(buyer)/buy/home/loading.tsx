export default function HomeLoading() {
  return (
    <div className="pb-6" role="status" aria-label="Loading home">
      <div className="flex items-start justify-between px-5 pb-2 pt-5">
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
          <div className="h-10 w-52 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="mt-1.5 h-12 w-12 shrink-0 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-3 pt-3">
        <div className="col-span-2 rounded-[12px] border border-cream-200 bg-cream-100 px-5 py-5">
          <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-10 w-44 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-4 w-40 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="rounded-[12px] border border-cream-200 bg-cream-100 px-4 py-5">
          <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-8 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="rounded-[12px] border border-cream-200 bg-cream-100 px-4 py-5">
          <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-8 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded bg-cream-200" />
        </div>
      </div>

      <div className="pt-10">
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="h-8 w-36 animate-pulse rounded bg-cream-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="flex gap-3 overflow-hidden px-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="w-[178px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200 bg-cream-100">
              <div className="h-[220px] animate-pulse bg-cream-100" />
              <div className="space-y-2 px-4 py-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-cream-200" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-cream-200" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-10">
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="h-8 w-44 animate-pulse rounded bg-cream-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="flex gap-3 overflow-hidden px-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="w-[280px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200 bg-cream-100">
                <div className="aspect-[15/8] w-full animate-pulse bg-cream-100" />
                <div className="space-y-2 bg-white px-5 py-4">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-cream-200" />
                  <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
                </div>
              </div>
          ))}
        </div>
      </div>

      <div className="pt-10">
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="h-8 w-40 animate-pulse rounded bg-cream-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="space-y-2 px-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[88px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
