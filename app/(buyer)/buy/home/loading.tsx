export default function HomeLoading() {
  return (
    <div className="pb-6" role="status" aria-label="Loading home">
      <div className="px-5 pb-2 pt-5">
        <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
        <div className="mt-2 h-10 w-52 animate-pulse rounded bg-cream-200" />
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-3 pt-3">
        <div className="col-span-2 rounded-[24px] border border-cream-200 bg-cream-100 px-5 py-5">
          <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-10 w-44 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-4 w-40 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="rounded-[22px] border border-cream-200 bg-cream-100 px-4 py-5">
          <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-8 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="rounded-[22px] border border-cream-200 bg-cream-100 px-4 py-5">
          <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-8 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded bg-cream-200" />
        </div>
      </div>

      <div className="pt-10">
        <div className="flex items-center justify-between px-4 pb-2">
          <div className="h-10 w-44 animate-pulse rounded bg-cream-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="flex gap-2 overflow-hidden px-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="w-[178px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200 bg-cream-100">
              <div className="relative h-[178px] animate-pulse bg-cream-100">
                <div className="absolute right-2 bottom-2 h-8 w-8 rounded-md bg-cream-200" />
              </div>
              <div className="space-y-1.5 px-2.5 py-2.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-cream-200" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-cream-200" />
                <div className="h-4 w-2/5 animate-pulse rounded bg-cream-200" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-10">
        <div className="flex items-center justify-between px-4 pb-2">
          <div className="h-10 w-52 animate-pulse rounded bg-cream-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="flex gap-2 overflow-hidden px-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="w-[280px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200 bg-cream-100">
              <div className="h-[170px] animate-pulse bg-cream-100" />
              <div className="space-y-1.5 px-2.5 py-2.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-cream-200" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-cream-200" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-10">
        <div className="flex items-center justify-between px-4 pb-2">
          <div className="h-10 w-44 animate-pulse rounded bg-cream-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="space-y-2 px-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[88px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
