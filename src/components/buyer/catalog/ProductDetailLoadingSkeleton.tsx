import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS } from '@/lib/buyer-lookbook';
import { BUYER_CARD_RADIUS_CLASS, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';
import { BuyerFixedFooter } from '@/components/buyer/layout/BuyerFixedFooter';

const SECTION_TITLE_STYLE = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--b-text-section)',
  fontWeight: 500,
  letterSpacing: '-0.005em',
} as const;

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-3 pb-3">
      <h2 className="leading-none text-[var(--cream-900)]" style={SECTION_TITLE_STYLE}>
        {title}
      </h2>
    </div>
  );
}

function ProductCarouselSkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden px-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} ${BUYER_CARD_RADIUS_CLASS} shrink-0 overflow-hidden border border-cream-200 bg-cream-50`}
        >
          <div className="aspect-square animate-pulse bg-cream-100" />
          <div className="bg-[var(--cream-50)] px-3 pb-3 pt-2.5">
            <div className={`${BUYER_TWO_LINE_TITLE_CLASS} animate-pulse rounded bg-cream-200`} />
            <div className="mt-0.5 h-3.5 w-2/5 animate-pulse rounded bg-cream-200" />
            <div className="mt-2 h-5 w-24 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SpecRowSkeleton({ isLast }: { isLast?: boolean }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderBottom: isLast ? undefined : '1px solid var(--border-1)' }}
    >
      <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
      <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
    </div>
  );
}

export function ProductDetailLoadingSkeleton() {
  return (
    <div className="flex min-h-[50dvh] flex-col bg-cream-100 pb-28" role="status" aria-label="Loading product">
      <div className="sticky top-0 z-[15] min-h-14 border-b border-cream-200 bg-cream-100/95 px-3 py-2 backdrop-blur-sm">
        <div className="flex min-h-10 items-center gap-2">
          <div className="h-10 w-10 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
          <span
            className="text-[var(--cream-900)]"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--b-text-body)',
              fontWeight: 600,
            }}
          >
            Product
          </span>
          <div className="ml-auto h-10 w-10 shrink-0 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
        </div>
      </div>

      <div className="pt-3">
        {/* Hero — square with card padding, matches live */}
        <div className="px-3">
          <div className="relative aspect-square w-full overflow-hidden bg-cream-100">
            <div className="absolute inset-0 animate-pulse bg-cream-100" />
          </div>
        </div>

        {/* Title block — brand, 2-line title, meta, price + struck secondary, validity */}
        <div className="space-y-2 px-3 py-4">
          <div className="h-3 w-16 animate-pulse rounded bg-cream-200" />
          <div className="min-h-[2.5rem] w-full animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-40 animate-pulse rounded bg-cream-200" />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <div className="h-7 w-24 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-4 w-36 animate-pulse rounded bg-cream-200" />
        </div>

        {/* Product Details accordion — real label + 5 SpecRow heights */}
        <div className="px-3 pb-4">
          <div className="flex w-full items-center justify-between py-2">
            <span className="text-base font-semibold text-[var(--cream-900)]">Product Details</span>
            <div className="h-5 w-5 animate-pulse rounded bg-cream-200" />
          </div>
          <div className={`overflow-hidden ${BUYER_CARD_RADIUS_CLASS} border border-cream-200 bg-cream-50`}>
            <SpecRowSkeleton />
            <SpecRowSkeleton />
            <SpecRowSkeleton />
            <SpecRowSkeleton />
            <SpecRowSkeleton isLast />
          </div>
        </div>

        <div className="pb-4">
          <SectionHeader title="Frequently Bought Together" />
          <ProductCarouselSkeletonCards />
        </div>

        <div className="pb-4">
          <SectionHeader title="More in this category" />
          <ProductCarouselSkeletonCards />
        </div>
      </div>

      <BuyerFixedFooter
        className="left-1/2 w-full -translate-x-1/2 border-t border-cream-200 bg-cream-100/95 px-3 py-3"
        style={{
          maxWidth: BUYER_PREVIEW_MAX_WIDTH,
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col items-end gap-1">
            <div className="h-7 w-20 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-14 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-11 min-w-[7rem] animate-pulse rounded-xl bg-cream-200" />
        </div>
      </BuyerFixedFooter>
    </div>
  );
}
