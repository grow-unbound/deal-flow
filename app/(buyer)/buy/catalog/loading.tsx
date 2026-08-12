import { BUYER_DISCOVERY_GRID_CLASS } from '@/lib/buyer-ui';

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
    <div className="flex items-center justify-between px-1 pb-3">
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

/** Mirrors CatalogDiscoveryLanding: campaigns → brands → categories with no left rail on landing. */
export default function CatalogLoading() {
  return (
    <div className="flex flex-col pb-8" role="status" aria-label="Loading catalog">
      <div className="sticky top-0 z-[15] border-b border-cream-200 bg-cream-50/95 backdrop-blur-md">
        <div className="flex items-end justify-between gap-3 px-4 pb-2 pt-6">
          <div className="min-w-0">
            <p
              className="font-semibold uppercase text-[var(--cream-700)]"
              style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.18em' }}
            >
              Browse
            </p>
            <h1
              className="mt-1.5 font-semibold leading-[0.96] text-[var(--cream-900)]"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--b-text-page-sm)',
                letterSpacing: '-0.022em',
              }}
            >
              Catalog
            </h1>
          </div>
          <div className="h-5 w-36 shrink-0 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="px-4 pb-2">
          <div className="h-10 w-full animate-pulse rounded-[12px] bg-cream-200" />
        </div>
      </div>

      <div className="px-5 pb-4 sm:px-4 lg:px-4 lg:pb-6">
        <section className="pt-10 lg:pt-6">
          <SectionHeader title="Campaigns" linkLabel="See all" />
          <div className="flex gap-3 overflow-hidden px-1">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="w-[280px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200"
              >
                <div className="aspect-[15/8] w-full animate-pulse bg-cream-100" />
                <div className="space-y-2 bg-white px-5 py-4">
                  <div className="line-clamp-2 min-h-[2.4em] animate-pulse rounded bg-cream-200" />
                  <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-10">
          <SectionHeader title="Brands" />
          <div className="flex gap-2 overflow-hidden px-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-[calc((100vw-2.5rem)/3)] max-w-[124px] shrink-0 overflow-hidden rounded-[12px] border border-cream-200 bg-[var(--bg-surface)] shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]"
              >
                <div className="aspect-square animate-pulse bg-cream-100" />
                <div className="flex min-h-[5.25rem] flex-col bg-cream-50 px-3 pb-3 pt-2.5">
                  <div className="line-clamp-2 min-h-[2.4em] animate-pulse rounded bg-cream-200" />
                  <div className="mt-0.5 h-3 w-14 animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-10 pb-4">
          <SectionHeader title="Categories" />
          <div className={BUYER_DISCOVERY_GRID_CLASS}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-[12px] border border-cream-200 bg-[var(--bg-surface)] shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]"
              >
                <div className="aspect-square animate-pulse bg-cream-100" />
                <div className="flex min-h-[5.25rem] flex-col bg-cream-50 px-3 pb-3 pt-2.5">
                  <div className="line-clamp-2 min-h-[2.4em] animate-pulse rounded bg-cream-200" />
                  <div className="mt-0.5 h-3 w-14 animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
