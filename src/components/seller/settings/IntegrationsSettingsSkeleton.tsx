const WRAP = 'max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6';

function IntegrationCardSkeleton() {
  return (
    <section className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-cream-200 bg-cream-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl border border-cream-200 bg-white" />
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-32 animate-pulse rounded bg-cream-200" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-cream-200" />
            </div>
            <div className="h-4 w-56 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 animate-pulse rounded-[9px] border border-cream-200 bg-white" />
          <div className="h-8 w-28 animate-pulse rounded-[9px] border border-cream-200 bg-white" />
          <div className="h-8 w-8 animate-pulse rounded-[9px] border border-cream-200 bg-white" />
        </div>
      </header>

      <div className="space-y-5 px-5 py-5">
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-cream-200 bg-cream-50 p-4">
              <div className="h-3 w-16 animate-pulse rounded bg-cream-200" />
              <div className="h-5 w-24 animate-pulse rounded bg-cream-200" />
              <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-6 border-b border-cream-200 pb-2">
          <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
        </div>
      </div>
    </section>
  );
}

export function IntegrationsSettingsContentSkeleton() {
  return (
    <div className="space-y-6" aria-busy role="status" aria-label="Loading integrations settings">
      <div className="flex items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="h-6 w-32 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-64 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="h-9 w-40 animate-pulse rounded-[9px] bg-cream-200" />
      </div>

      <div className="space-y-6">
        <IntegrationCardSkeleton />
        <IntegrationCardSkeleton />
      </div>
    </div>
  );
}

export function IntegrationsSettingsPageSkeleton() {
  return (
    <div className={WRAP}>
      <IntegrationsSettingsContentSkeleton />
    </div>
  );
}
