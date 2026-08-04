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
          className="w-[178px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200 bg-cream-50"
        >
          <div className="aspect-square animate-pulse bg-cream-100" />
          <div className="bg-[var(--cream-50)] px-3 pb-3 pt-2.5">
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
    <div className="grid grid-cols-2 gap-2 px-2 pb-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-[12px] border border-cream-200 bg-[var(--bg-surface)] shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]"
        >
          <div className="relative aspect-square animate-pulse bg-cream-100">
            <div className="absolute right-2 bottom-2 h-8 w-8 rounded-md bg-cream-200" />
          </div>
          <div className="flex flex-col gap-1.5 bg-cream-50 p-2.5">
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
    <div className="flex min-h-[50dvh] flex-col pb-8" role="status" aria-label={`Loading ${title}`}>
      <div className="sticky top-0 z-[15] border-b border-cream-200 bg-cream-50">
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
        {/* Filter-chip carousel — matches BuyerEntityChipNav footprint */}
        <div className="border-t border-cream-200 pb-2 pt-1">
          <div className="flex gap-2 overflow-hidden px-4 pb-1 pt-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-cream-200" />
            ))}
          </div>
        </div>
      </div>

      <div className="pt-3">
        <div className="pb-4 pt-1">
          <SectionHeader title={recoTitle} />
          <RecoCarouselSkeleton />
        </div>

        <div className="px-4 pb-3 pt-4">
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

        <ProductGridSkeleton count={6} />
      </div>
    </div>
  );
}
