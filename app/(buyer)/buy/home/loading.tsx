const SECTION_TITLE_STYLE = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--b-text-section)',
  fontWeight: 500,
  letterSpacing: '-0.005em',
} as const;

const SECTION_LINK_STYLE = {
  fontSize: 'var(--b-text-label)',
} as const;

function SectionHeader({ title, linkLabel }: { title: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between px-4 pb-3">
      <h2 className="leading-none text-[var(--cream-900)]" style={SECTION_TITLE_STYLE}>
        {title}
      </h2>
      {linkLabel ? (
        <span
          className="inline-flex items-center gap-1.5 font-medium tracking-[-0.01em] text-[var(--teal-500)]"
          style={SECTION_LINK_STYLE}
        >
          {linkLabel}
        </span>
      ) : null}
    </div>
  );
}

function PromotionCarouselSkeletonCards() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="w-[280px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200 bg-cream-50">
          <div className="aspect-[15/8] w-full animate-pulse bg-cream-100" />
          <div className="space-y-2 bg-white px-5 py-4">
            <div className="line-clamp-2 min-h-[2.4em] animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </>
  );
}

function ProductCarouselSkeletonCards() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="w-[178px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200 bg-cream-50">
          <div className="aspect-square animate-pulse bg-cream-100" />
          <div className="bg-[var(--cream-50)] px-3 pb-3 pt-2.5">
            <div className="line-clamp-2 min-h-[2.4em] animate-pulse rounded bg-cream-200" />
            <div className="mt-0.5 h-3.5 w-2/5 animate-pulse rounded bg-cream-200" />
            <div className="mt-2 h-5 w-24 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function HomeLoading() {
  return (
    <div className="pb-8" role="status" aria-label="Loading home">
      <div className="flex items-start justify-between px-5 pb-2 pt-6">
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
          <h1
            className="font-semibold leading-[0.96] text-[var(--cream-900)]"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-page-sm)', letterSpacing: '-0.022em' }}
          >
            Your shelf, this quarter.
          </h1>
        </div>
        <div className="mt-1.5 h-12 w-12 shrink-0 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-3 pt-3">
        <div className="rounded-[12px] bg-[#1f3a33] px-4 py-5">
          <div className="h-3 w-28 animate-pulse rounded bg-white/20" />
          <div className="mt-3 h-10 w-28 animate-pulse rounded bg-white/20" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded bg-white/20" />
        </div>
        <div className="rounded-[12px] bg-[#1f3a33] px-4 py-5">
          <div className="h-3 w-28 animate-pulse rounded bg-white/20" />
          <div className="mt-3 h-10 w-28 animate-pulse rounded bg-white/20" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded bg-white/20" />
        </div>
        <div className="rounded-[12px] border border-cream-200 bg-cream-50 px-4 py-5">
          <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-8 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="rounded-[12px] border border-cream-200 bg-cream-50 px-4 py-5">
          <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-8 w-24 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="col-span-2 h-4 w-40 animate-pulse rounded bg-cream-200 px-1" />
      </div>

      <div className="pt-10">
        <SectionHeader title="Promotions" linkLabel="See all" />
        <div className="flex gap-3 overflow-hidden px-4">
          <PromotionCarouselSkeletonCards />
        </div>
      </div>

      <div className="pt-10">
        <SectionHeader title="Order again" />
        <div className="flex gap-3 overflow-hidden px-4">
          <ProductCarouselSkeletonCards />
        </div>
      </div>

      <div className="pt-10">
        <SectionHeader title="Bestsellers" />
        <div className="flex gap-3 overflow-hidden px-4">
          <ProductCarouselSkeletonCards />
        </div>
      </div>

      <div className="pt-10">
        <SectionHeader title="Recent activity" linkLabel="See all" />
        <div className="space-y-2 px-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[88px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
