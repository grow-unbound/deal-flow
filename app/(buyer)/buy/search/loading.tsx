export default function BuyerSearchLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col bg-[var(--bg-base)] pb-[var(--tab-bar)]">
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--border-1)] bg-[var(--bg-base)]/95 px-3 py-2 backdrop-blur-md">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
        <div className="h-10 min-w-0 flex-1 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
      </div>
      <div className="px-4 pt-3">
        <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-xl border border-cream-200 bg-cream-100 animate-pulse"
          >
            <div className="aspect-square bg-cream-200" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-2/3 rounded bg-cream-200" />
              <div className="h-4 w-full rounded bg-cream-200" />
              <div className="h-3 w-1/2 rounded bg-cream-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
