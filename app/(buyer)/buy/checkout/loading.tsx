// Mirrors buyer checkout page: sticky header + cart items + notes/summary card + submit button
export default function CheckoutLoading() {
  return (
    <div className="flex flex-col min-h-screen" role="status" aria-label="Loading checkout">
      {/* Sticky header */}
      <div className="flex items-center gap-3 px-4 border-b border-cream-200 bg-cream-50" style={{ height: 'var(--header-h, 52px)' }}>
        <div className="h-8 w-8 animate-pulse rounded-md bg-cream-200" />
        <div className="h-5 w-24 animate-pulse rounded-md bg-cream-200" />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
        {/* Cart items card */}
        <div className="animate-pulse rounded-xl border border-cream-200 bg-cream-50 p-4 space-y-3">
          <div className="h-4 w-28 rounded bg-cream-200" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="h-4 flex-1 rounded bg-cream-200" />
                <div className="h-4 w-16 shrink-0 rounded bg-cream-200" />
              </div>
            ))}
          </div>
          <div className="border-t border-cream-200 pt-3 flex justify-between">
            <div className="h-4 w-16 rounded bg-cream-200" />
            <div className="h-4 w-20 rounded bg-cream-200" />
          </div>
        </div>

        {/* Notes textarea */}
        <div className="h-24 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />

        {/* Delivery location card */}
        <div className="animate-pulse rounded-xl border border-cream-200 bg-cream-50 p-4">
          <div className="mb-2 h-3 w-20 rounded bg-cream-200" />
          <div className="h-4 w-44 rounded bg-cream-200" />
          <div className="mt-2 h-3 w-28 rounded bg-cream-200" />
        </div>
      </div>

      {/* Submit button */}
      <div className="px-4 pb-6 pt-2">
        <div className="h-12 w-full animate-pulse rounded-lg bg-teal-200" />
      </div>
    </div>
  );
}
