/**
 * Route-level skeleton for Direction B transactional detail pages (sales orders, estimates, invoices).
 * Mirrors TransactionalPageHead + TransactionalStatusBand + TransactionalGrid without importing client-only modules.
 */
export function TransactionalDetailSkeleton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <div
      className="mx-auto w-full max-w-[1440px] space-y-4 px-8 pb-6 pt-7"
      role="status"
      aria-label={ariaLabel}
    >
      <div className="h-4 w-40 animate-pulse rounded bg-cream-200" />

      <div className="space-y-3 border-b border-cream-300 pb-5">
        <div className="flex justify-between gap-4">
          <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
          <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-8 w-56 animate-pulse rounded bg-cream-200" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-cream-200" />
        </div>
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-cream-200" />
      </div>

      <div className="rounded-[14px] border border-cream-200 bg-white p-5">
        <div className="flex w-full items-start gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-cream-200" />
              <div className="h-3 w-16 animate-pulse rounded bg-cream-200" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between gap-4 border-t border-cream-100 pt-4">
          <div className="space-y-2">
            <div className="h-2 w-20 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-72 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-8 w-32 animate-pulse rounded-[7px] bg-cream-200" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_380px] items-start gap-5">
        <div className="flex flex-col gap-3">
          <div className="h-40 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
          <div className="h-36 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
          <div className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
          <div className="h-32 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        </div>
      </div>
    </div>
  );
}
