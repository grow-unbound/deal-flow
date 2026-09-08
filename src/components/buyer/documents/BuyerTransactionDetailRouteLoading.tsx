/** Shared route-level skeleton for order / estimate / invoice detail pages. */
import { BuyerFixedFooter } from '@/components/buyer/layout/BuyerFixedFooter';

export function BuyerTransactionDetailRouteLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50dvh] flex-col pb-[var(--tab-bar)]" role="status" aria-label={`Loading ${label}`}>
      <header
        className="sticky top-0 z-[15]"
        style={{
          borderBottom: '1px solid rgba(212, 204, 192, 0.6)',
          background: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)',
        }}
      >
        <div className="flex min-h-14 items-center gap-2 px-3 py-2">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-cream-200" />
          <div className="min-w-0 flex-1">
            <div className="h-7 w-28 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      </header>

      <div className="space-y-3 px-4 py-4 pb-24 pt-6">
        <div className="space-y-2 px-1">
          <div className="h-3 w-32 animate-pulse rounded-full bg-cream-200" />
          <div className="flex items-start justify-between gap-3">
            <div className="h-8 w-40 animate-pulse rounded bg-cream-200" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-cream-200" />
          </div>
          <div className="h-4 w-52 animate-pulse rounded-full bg-cream-200" />
        </div>
        <div className="h-40 animate-pulse rounded-[12px] border border-cream-200 bg-[var(--bg-surface)]" />
        <div className="h-28 animate-pulse rounded-[12px] border border-cream-200 bg-[var(--bg-surface)]" />
        <div className="h-24 animate-pulse rounded-[12px] border border-cream-200 bg-[var(--bg-surface)]" />
      </div>

      <BuyerFixedFooter
        className="left-0 right-0 border-t border-cream-200 px-4 py-3"
        style={{
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
          background: 'color-mix(in srgb, var(--bg-surface) 95%, transparent)',
        }}
      >
        <div className="mx-auto h-11 max-w-[840px] animate-pulse rounded-xl bg-cream-200" />
      </BuyerFixedFooter>
    </div>
  );
}
