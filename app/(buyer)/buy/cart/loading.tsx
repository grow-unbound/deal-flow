// Mirrors cart page: sticky header + line items + footer CTA
export default function CartLoading() {
  return (
    <div className="flex min-h-screen flex-col" role="status" aria-label="Loading cart">
      <div
        className="sticky top-0 z-20 flex items-center gap-2 border-b border-cream-200 px-4"
        style={{ height: 'var(--header-h, 56px)', background: 'rgba(253, 251, 247, 0.92)' }}
      >
        <div className="h-8 w-8 animate-pulse rounded-md bg-cream-200" />
        <div className="h-5 w-24 animate-pulse rounded-md bg-cream-200" />
      </div>
      <div className="flex-1 space-y-3 px-4 py-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-cream-200 bg-cream-100 p-3 animate-pulse"
          >
            <div className="h-16 w-16 shrink-0 rounded-lg bg-cream-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 max-w-[12rem] flex-1 rounded bg-cream-200" />
              <div className="h-3 w-20 rounded bg-cream-200" />
            </div>
            <div className="h-8 w-20 shrink-0 rounded-md bg-cream-200" />
          </div>
        ))}
      </div>
      <div className="border-t border-cream-200 px-4 pb-safe pt-3">
        <div className="mb-3 flex justify-between">
          <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="flex gap-2">
          <div className="h-12 flex-1 animate-pulse rounded-xl bg-cream-200" />
          <div className="h-12 flex-[1.4] animate-pulse rounded-xl bg-cream-200" />
        </div>
      </div>
    </div>
  );
}
