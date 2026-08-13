export default function ProfileLoading() {
  return (
    <div className="min-h-dvh bg-[#f8f4ed]" role="status" aria-label="Loading profile">
      <div className="bg-[linear-gradient(135deg,#21433B_0%,#17372F_100%)] px-4 pb-8 pt-8 md:hidden">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
          <div className="flex-1 space-y-3">
            <div className="h-9 w-40 animate-pulse rounded bg-cream-200" />
            <div className="h-5 w-48 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 md:hidden">
        <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
        <div className="mt-3 overflow-hidden rounded-[12px] border border-cream-200 bg-cream-100">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className={`flex items-center gap-4 px-4 py-4 ${index < 2 ? 'border-b border-cream-200' : ''}`}
            >
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-[12px] bg-cream-200" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 animate-pulse rounded bg-cream-200" />
                <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
              </div>
              <div className="h-5 w-5 animate-pulse rounded bg-cream-200" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 px-4 pt-5 md:hidden">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-[12px] border border-cream-200 bg-cream-100">
            <div className="flex items-center gap-4 px-4 py-4">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-[12px] bg-cream-200" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 animate-pulse rounded bg-cream-200" />
                <div className="h-4 w-40 animate-pulse rounded bg-cream-200" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden px-6 py-6 md:block xl:px-8">
        <div className="grid min-h-[calc(100dvh-180px)] grid-cols-[320px_minmax(0,1fr)] overflow-hidden rounded-[28px] border border-cream-200 bg-white shadow-[0_20px_60px_rgba(20,40,35,0.08)]">
          <aside className="border-r border-cream-200 bg-[#fcfaf6] p-5">
            <div className="rounded-[22px] bg-white p-5 shadow-[0_1px_0_rgba(34,30,26,0.03)]">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
                <div className="flex-1 space-y-3">
                  <div className="h-7 w-32 animate-pulse rounded bg-cream-200" />
                  <div className="h-4 w-36 animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-[16px] bg-cream-200" />
              ))}
            </div>
          </aside>
          <section className="bg-[#f8f4ed] p-6">
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="h-3 w-16 animate-pulse rounded bg-cream-200" />
                <div className="h-9 w-56 animate-pulse rounded bg-cream-200" />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="rounded-[22px] border border-cream-200 bg-white p-5">
                    <div className="h-6 w-32 animate-pulse rounded bg-cream-200" />
                    <div className="mt-4 space-y-4">
                      <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
                      <div className="h-5 w-40 animate-pulse rounded bg-cream-200" />
                      <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
                      <div className="h-5 w-32 animate-pulse rounded bg-cream-200" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
