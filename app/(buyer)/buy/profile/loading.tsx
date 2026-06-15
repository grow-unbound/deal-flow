// Mirrors profile: sticky header + stacked rows
export default function ProfileLoading() {
  return (
    <div className="flex min-h-screen flex-col p-4" role="status" aria-label="Loading profile">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-6 w-28 animate-pulse rounded-md bg-cream-200" />
        <div className="h-8 w-8 animate-pulse rounded-md bg-cream-200" />
      </div>
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="h-20 w-20 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
        <div className="h-5 w-40 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-56 animate-pulse rounded bg-cream-200" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-cream-200 bg-cream-100 px-3 py-3 animate-pulse"
          >
            <div className="h-8 w-8 shrink-0 rounded-lg bg-cream-200" />
            <div className="h-4 flex-1 rounded bg-cream-200" />
            <div className="h-4 w-4 shrink-0 rounded bg-cream-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
