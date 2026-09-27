import { ChevronLeft } from 'lucide-react';
import { BuyerCatalogDesktopLayout } from '@/components/buyer/catalog/BuyerCatalogDesktopLayout';
import { LoadingSkeleton } from '@/components/buyer/catalog/LoadingSkeleton';
import { RecoSectionSkeleton } from '@/components/buyer/catalog/RecoSection';
import { BuyerSectionRow } from '@/components/buyer/layout/BuyerSectionRow';
import { BUYER_DETAIL_RAIL_ITEM_CLASS, BUYER_DETAIL_RAIL_THUMB_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';

/**
 * Route loading for category/brand detail. Mirrors CatalogFilteredBrowse inside
 * BuyerDetailShell, with mobile (<md) and desktop (md+) chrome built separately:
 * - mobile: sticky header (back / title / search icon) + search row above the rail+grid
 * - desktop: no header (the shell hides it at md+); title + search live in the content pane
 */

/** Left rail placeholder — shared with CatalogFilteredBrowse's own chips-loading state. */
export function CatalogRailSkeleton() {
  return (
    <div className="flex flex-col" role="status" aria-label="Loading desktop filters">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className={cn(BUYER_DETAIL_RAIL_ITEM_CLASS, 'border-b border-cream-200 last:border-b-0')}
        >
          <div className={cn(BUYER_DETAIL_RAIL_THUMB_CLASS, 'shrink-0 animate-pulse rounded-[10px] border border-cream-200 bg-[var(--bg-surface)] lg:rounded-[12px]')}>
            <div className="h-full w-full rounded-[8px] bg-cream-200 lg:rounded-[10px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-4 w-14 animate-pulse rounded bg-cream-200 lg:w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchInputSkeleton({ className }: { className?: string }) {
  return <div className={cn('h-[42px] w-full animate-pulse rounded-[10px] border border-cream-300 bg-cream-100', className)} />;
}

function MobileHeaderSkeleton() {
  return (
    <header
      className="sticky top-0 z-[15] md:hidden"
      style={{ borderBottom: '1px solid rgba(212, 204, 192, 0.6)', background: 'var(--bg-base)' }}
    >
      <div className="flex min-h-14 items-center gap-2 px-3 py-2">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--fg-2)]" aria-hidden>
          <ChevronLeft className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-5 w-40 max-w-full animate-pulse rounded bg-cream-200" />
        </div>
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg border border-[var(--border-1)] bg-cream-200" />
      </div>
      <div className="border-t border-[var(--border-1)] bg-[var(--bg-base)] px-4 py-2.5">
        <SearchInputSkeleton />
      </div>
    </header>
  );
}

function DesktopTitleSkeleton() {
  return (
    <div className="hidden px-2 pt-5 md:block lg:px-2 lg:pt-6">
      {/* h1 at --b-text-page-sm with mb-3 */}
      <div className="mb-3 h-8 w-56 animate-pulse rounded bg-cream-200" />
      <SearchInputSkeleton className="max-w-[34rem]" />
    </div>
  );
}

export function CatalogBrowseDetailLoading({
  title,
  recoTitle,
}: {
  title: string;
  recoTitle: string;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      role="status"
      aria-label={`Loading ${title}`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeaderSkeleton />
        <div className="h-px w-full shrink-0" aria-hidden />
        <div className="min-h-0 flex-1 overflow-visible pt-3 md:overflow-visible md:pt-0">
          <BuyerCatalogDesktopLayout rail={<CatalogRailSkeleton />} splitScroll>
            <DesktopTitleSkeleton />

            <div className="pt-1 lg:pt-6">
              <div className="pb-4">
                <BuyerSectionRow title={recoTitle} className="px-4 pb-3" />
                <RecoSectionSkeleton />
              </div>
            </div>

            <div className="px-4 pb-3 pt-4 lg:px-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fg-3)]">
                Browse
              </p>
              <h2
                className="mt-1 text-base font-semibold text-[var(--fg-1)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                All Products
              </h2>
            </div>

            <LoadingSkeleton count={6} />
          </BuyerCatalogDesktopLayout>
        </div>
      </div>
    </div>
  );
}
