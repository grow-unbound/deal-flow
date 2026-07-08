export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-6 px-8 py-6">
      <div className="space-y-2" role="status" aria-label="Loading recommendations settings">
        <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
        <div className="h-9 w-72 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-[32rem] max-w-full animate-pulse rounded bg-cream-200" />
      </div>

      <div className="flex gap-6 border-b border-cream-300 pb-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 w-32 animate-pulse rounded bg-cream-100" />
        ))}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-[28rem] max-w-full animate-pulse rounded bg-cream-100" />
        </div>
        <div className="w-full rounded-xl border border-cream-200 bg-cream-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse border-b border-cream-200 bg-cream-100 last:border-b-0"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
