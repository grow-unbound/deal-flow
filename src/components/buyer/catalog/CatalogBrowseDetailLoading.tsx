import {
  BUYER_DETAIL_RAIL_GRID_CLASS,
  BUYER_DETAIL_RAIL_ITEM_CLASS,
  BUYER_DETAIL_RAIL_THUMB_CLASS,
  BUYER_PRODUCT_GRID_CLASS,
} from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';

/** Shared route loading for category/brand detail — mirrors CatalogFilteredBrowse layout. */

const SECTION_TITLE_STYLE = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--b-text-section)',
  fontWeight: 500,
  letterSpacing: '-0.005em',
} as const;

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-4 pb-3">
      <h2 className="leading-none text-[var(--cream-900)]" style={SECTION_TITLE_STYLE}>
        {title}
      </h2>
    </div>
  );
}

function RecoCarouselSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden px-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="w-[178px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200 bg-[var(--bg-surface)]"
        >
          <div className="aspect-square animate-pulse bg-cream-100" />
          <div className="bg-[var(--bg-surface)] px-3 pb-3 pt-2.5">
            <div className="line-clamp-2 min-h-[2.4em] animate-pulse rounded bg-cream-200" />
            <div className="mt-0.5 h-3.5 w-2/5 animate-pulse rounded bg-cream-200" />
            <div className="mt-2 h-5 w-24 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={BUYER_PRODUCT_GRID_CLASS}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-[12px] border border-cream-200 bg-[var(--bg-surface)]"
        >
          <div className="relative aspect-square animate-pulse bg-cream-100">
            <div className="absolute right-2 bottom-2 h-8 w-8 rounded-md bg-cream-200" />
          </div>
          <div className="flex flex-col gap-1.5 bg-[var(--bg-surface)] p-2.5">
            <div className="flex min-h-[2.4em] flex-col justify-center gap-1">
              <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-cream-200" />
              <div className="h-2.5 w-3/5 animate-pulse rounded-full bg-cream-200" />
            </div>
            <div className="h-2 w-2/5 animate-pulse rounded-full bg-cream-200" />
            <div className="mt-0.5 h-4 w-2/5 animate-pulse rounded-full bg-cream-200" />
          </div>
        </div>
      ))}
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
    <div className="flex min-h-[50dvh] flex-col" role="status" aria-label={`Loading ${title}`}>
      <div className="sticky top-0 z-[15] border-b border-cream-200 bg-[var(--bg-surface)]">
        <div className="flex min-h-14 items-center gap-2 px-3 py-2">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
          <h1
            className="min-w-0 flex-1 truncate font-semibold leading-tight text-[var(--cream-900)]"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--b-text-header)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h1>
        </div>
        <div className="border-t border-cream-200 px-4 py-2.5">
          <div className="h-11 w-full animate-pulse rounded-[12px] bg-cream-200" />
        </div>
      </div>

      <div className={cn(BUYER_DETAIL_RAIL_GRID_CLASS, 'pt-3 pb-0 lg:pb-0')}>
        <aside className="min-w-0 border-r border-cream-200 pr-1.5 sm:pr-3 lg:pt-6 lg:pr-4">
          <div className="sticky top-3 lg:top-[10.5rem]">
            <div className="flex flex-col" aria-label="Loading desktop filters">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={cn(BUYER_DETAIL_RAIL_ITEM_CLASS, 'border-b border-cream-200 last:border-b-0')}>
                  <div className={cn(BUYER_DETAIL_RAIL_THUMB_CLASS, 'shrink-0 animate-pulse rounded-[10px] border border-cream-200 bg-[var(--bg-surface)] lg:rounded-[12px]')}>
                    <div className="h-full w-full rounded-[8px] bg-cream-200 lg:rounded-[10px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-14 animate-pulse rounded bg-cream-200 lg:w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="pb-4 pt-1 lg:pt-6">
            <SectionHeader title={recoTitle} />
            <RecoCarouselSkeleton />
          </div>

          <div className="px-4 pb-3 pt-4 lg:px-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fg-3)]">
                  Browse
                </p>
                <h2
                  className="mt-1 text-lg font-semibold text-[var(--fg-1)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  All Products
                </h2>
              </div>
              <div className="h-4 w-14 shrink-0 animate-pulse rounded bg-cream-200" />
            </div>
          </div>

          <ProductGridSkeleton count={10} />
        </div>
      </div>
    </div>
  );
}
