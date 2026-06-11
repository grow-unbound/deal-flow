import { PageWrap } from '@/components/seller/layout';

export default function SettingsBillingLoading() {
  return (
    <PageWrap className="space-y-6">
      <div className="space-y-2" role="status" aria-label="Loading billing settings">
        <div className="h-4 w-36 animate-pulse rounded bg-cream-200" />
        <div className="h-9 w-64 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-cream-200" />
      </div>

      <div className="h-52 animate-pulse rounded-xl border border-cream-100 bg-cream-100" />

      <div className="overflow-hidden rounded-xl border border-cream-100 bg-white shadow-xs">
        <header className="border-b border-cream-100 bg-cream-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-cream-100 ring-1 ring-cream-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-48 animate-pulse rounded bg-cream-200" />
              <div className="h-4 w-full max-w-md animate-pulse rounded bg-cream-200" />
            </div>
          </div>
        </header>
        <div className="space-y-4 px-5 py-5">
          <div className="h-24 animate-pulse rounded-lg bg-cream-50" />
        </div>
      </div>

      <div className="h-28 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />

      <section className="overflow-hidden rounded-xl border border-cream-100 bg-white shadow-xs">
        <header className="border-b border-cream-100 bg-cream-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-cream-100 ring-1 ring-cream-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-44 animate-pulse rounded bg-cream-200" />
              <div className="h-4 w-full max-w-lg animate-pulse rounded bg-cream-200" />
            </div>
          </div>
        </header>
        <div className="px-5 py-5">
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded border border-cream-100 bg-cream-50" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded border border-cream-100 bg-cream-50" />
            ))}
          </div>
        </div>
      </section>
    </PageWrap>
  );
}
