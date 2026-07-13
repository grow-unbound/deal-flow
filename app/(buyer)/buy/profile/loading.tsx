export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-[#f8f4ed]" role="status" aria-label="Loading profile">
      <div className="bg-[linear-gradient(135deg,#21433B_0%,#17372F_100%)] px-4 pb-8 pt-8">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
          <div className="flex-1 space-y-3">
            <div className="h-9 w-40 animate-pulse rounded bg-cream-200" />
            <div className="h-5 w-48 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      </div>

      <div className="px-4 pt-5">
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

      <div className="space-y-3 px-4 pt-5">
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
    </div>
  );
}
