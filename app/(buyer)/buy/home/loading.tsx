import { BUYER_PRODUCT_GRID_CLASS, BUYER_TILE_FRAME_CLASS, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';
import { BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS } from '@/lib/buyer-lookbook';
import { cn } from '@/lib/utils';

const SECTION_TITLE_STYLE = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--b-text-section)',
  fontWeight: 500,
  letterSpacing: '-0.005em',
} as const;

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-1 pb-3">
      <h2 className="leading-none text-[var(--cream-900)]" style={SECTION_TITLE_STYLE}>
        {title}
      </h2>
    </div>
  );
}

/** Mirrors CatalogDiscoveryLanding guest first-paint: bestsellers → brands → categories carousel → product grid. */
export default function CatalogLoading() {
  return (
    <div className="flex flex-col pb-8" role="status" aria-label="Loading catalog">
      <div className="sticky top-0 z-[15] border-b border-cream-200 bg-cream-50/95 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-cream-200" />
              <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
            </div>
          </div>
          <div className="h-9 w-16 shrink-0 animate-pulse rounded-[12px] bg-cream-200" />
        </div>
        <div className="px-4 pb-2">
          <div className="h-10 w-full animate-pulse rounded-[12px] bg-cream-200" />
        </div>
      </div>

      <div className="px-5 pb-4 sm:px-4 lg:px-4 lg:pb-6">
        <section className="pt-8">
          <SectionHeader title="Bestsellers" />
          <div className="flex gap-2.5 overflow-hidden px-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} shrink-0 overflow-hidden rounded-[12px] border border-cream-200 bg-cream-50`}>
                <div className="aspect-square animate-pulse bg-cream-100" />
                <div className="px-2 pb-2 pt-1.5">
                  <div className={BUYER_TWO_LINE_TITLE_CLASS + ' animate-pulse rounded bg-cream-200'} style={{ fontSize: 'var(--b-text-label)' }} />
                  <div className="mt-1 h-4 w-16 animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-8">
          <SectionHeader title="Brands" />
          <div className="flex gap-2 overflow-hidden px-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex w-[calc((100vw-2.5rem)/3)] max-w-[124px] shrink-0 flex-col items-center">
                <div className="aspect-square w-full animate-pulse rounded-full border border-cream-200 bg-cream-100" />
                <div
                  className={cn('mt-1.5 w-3/4 animate-pulse rounded bg-cream-200', BUYER_TWO_LINE_TITLE_CLASS)}
                  style={{ fontSize: 'var(--b-text-body)' }}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="pt-8">
          <SectionHeader title="Categories" />
          <div className="flex gap-2 overflow-hidden px-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex w-[88px] shrink-0 flex-col items-center">
                <div className="aspect-square w-full animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
                <div
                  className={cn('mt-1.5 w-3/4 animate-pulse rounded bg-cream-200', BUYER_TWO_LINE_TITLE_CLASS)}
                  style={{ fontSize: 'var(--b-text-body)' }}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="pt-8 pb-4">
          <SectionHeader title="Products" />
          <div className={BUYER_PRODUCT_GRID_CLASS}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${BUYER_TILE_FRAME_CLASS} rounded-[12px]`}>
                <div className="aspect-square animate-pulse bg-cream-100" />
                <div className="flex flex-col px-3 pt-2.5">
                  <div className={BUYER_TWO_LINE_TITLE_CLASS + ' animate-pulse rounded bg-cream-200'} style={{ fontSize: 'var(--b-text-body)' }} />
                  <div className="mt-2 h-4 w-16 animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
