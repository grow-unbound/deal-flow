import { BUYER_INVOICE_STATUS_CHIPS } from '@/lib/buyer-transaction-filters';

export function OrdersTabBarSkeleton() {
  return (
    <div
      className="mx-4 rounded-[10px] bg-[var(--cream-200)] p-[3px]"
      role="status"
      aria-label="Loading tabs"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={`flex h-8 flex-1 items-center justify-center rounded-lg px-2 ${
            i === 0 ? 'bg-white' : ''
          }`}
        >
          <div
            className={`h-3.5 w-14 animate-pulse rounded ${
              i === 0 ? 'bg-cream-200' : 'bg-cream-300/80'
            }`}
          />
        </div>
      ))}
    </div>
  );
}

export function OrdersLandingSkeleton({
  filterChips = BUYER_INVOICE_STATUS_CHIPS,
}: {
  filterChips?: readonly string[];
} = {}) {
  return (
    <div className="flex h-full min-h-full flex-col" role="status" aria-label="Loading orders">
      <div className="sticky top-0 z-[15] border-b border-[var(--border-1)] bg-[var(--bg-base)] md:hidden">
        <div className="px-5 pb-2 pt-4">
          <p
            className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--cream-700)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Activity
          </p>
          <h1
            className="mt-0.5 font-semibold leading-tight text-[var(--cream-900)]"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--b-text-page)',
              letterSpacing: '-0.025em',
            }}
          >
            Your orders
          </h1>
        </div>
        <OrdersTabBarSkeleton />
        <div className="border-t border-cream-200 px-4 py-3">
          <div className="flex h-[42px] items-center gap-2.5 rounded-[12px] border border-[var(--border-2)] bg-white px-3.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-600)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="text-[length:var(--b-text-body)] text-[var(--cream-500)]">Search invoices…</span>
          </div>
        </div>
        <div className="border-t border-cream-200">
          <div className="flex gap-2 overflow-hidden px-4 pb-3 pt-3">
            {filterChips.map((chip, index) => (
              <span
                key={chip}
                className={
                  index === 0
                    ? 'shrink-0 rounded-full border border-[var(--teal-500)] bg-[var(--teal-500)] px-3.5 py-1.5 text-[length:var(--b-text-label)] font-medium text-white'
                    : 'shrink-0 rounded-full border border-[var(--cream-400)] bg-[var(--cream-50)] px-3.5 py-1.5 text-[length:var(--b-text-label)] font-medium text-[var(--cream-800)]'
                }
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 md:hidden">
        <div className="rounded-[18px] border border-[var(--border-1)] bg-[var(--cream-50)] px-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index}>
                <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
                <div className="mt-2 h-7 w-24 animate-pulse rounded bg-cream-200" />
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-cream-200 pt-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index}>
                <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
                <div className="mt-2 h-4 w-28 animate-pulse rounded bg-cream-200" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3 md:hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[88px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100 px-3.5 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-28 rounded bg-cream-200" />
                <div className="h-3 w-36 rounded bg-cream-200" />
                <div className="h-2.5 w-24 rounded bg-cream-200" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="h-5 w-16 rounded-full bg-cream-200" />
                <div className="h-4 w-14 rounded bg-cream-200" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <div className="px-6 pt-6 xl:px-8">
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-[14px] border border-cream-200 bg-white px-[18px] py-[16px]">
                <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
                <div className="mt-2 h-6 w-24 animate-pulse rounded bg-cream-200" />
                <div className="mt-2 h-4 w-32 animate-pulse rounded bg-cream-200" />
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 pt-1 xl:px-8">
          <div className="flex items-end gap-6 border-b border-cream-300">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`border-b-2 px-5 py-3.5 ${i === 0 ? 'border-ember-500' : 'border-transparent'}`}>
                <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 px-6 pb-6 xl:px-8">
          <div className="grid h-full min-h-0 grid-cols-[30fr_1px_70fr]">
            <div className="min-h-0 overflow-hidden pr-3">
              <div className="space-y-3 py-4">
                <div className="h-12 animate-pulse rounded-[12px] border border-cream-200 bg-white" />
                <div className="flex gap-2 overflow-hidden">
                  {filterChips.map((chip, index) => (
                    <span
                      key={chip}
                      className={
                        index === 0
                          ? 'shrink-0 rounded-full border border-[var(--teal-500)] bg-[var(--teal-500)] px-3.5 py-1.5 text-[length:var(--b-text-label)] font-medium text-white'
                          : 'shrink-0 rounded-full border border-[var(--cream-400)] bg-[var(--cream-50)] px-3.5 py-1.5 text-[length:var(--b-text-label)] font-medium text-[var(--cream-800)]'
                      }
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="min-h-[88px] animate-pulse rounded-[18px] border border-cream-200 bg-cream-100 px-3.5 py-3" />
                ))}
              </div>
            </div>
            <div className="bg-cream-300" />
            <div className="min-h-0 pl-4">
              <div className="h-full min-h-0 animate-pulse rounded-[20px] border border-cream-200 bg-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
