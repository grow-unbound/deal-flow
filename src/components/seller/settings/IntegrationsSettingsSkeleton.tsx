const WRAP = 'max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6';

function IntegrationCardSkeleton({ selected = false }: { selected?: boolean }) {
  return (
    <div
      className={[
        'rounded-2xl border bg-white p-5',
        selected ? 'border-teal-200 shadow-xs' : 'border-cream-200',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="h-11 w-11 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
          <div className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-full max-w-sm animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-56 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
        <div className="h-7 w-28 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
      </div>

      <div className="mt-5 space-y-3 border-t border-cream-200 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
          <div className="h-9 w-32 animate-pulse rounded-[9px] border border-cream-200 bg-cream-100" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="h-16 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
          <div className="h-16 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        </div>
      </div>
    </div>
  );
}

function IntegrationDetailSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border border-cream-300 bg-white shadow-xs">
      <header className="border-b border-cream-200 bg-cream-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-full max-w-md animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      </header>

      <div className="space-y-5 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4">
          <div className="space-y-2">
            <div className="h-5 w-44 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-full max-w-sm animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-9 w-32 animate-pulse rounded-[9px] border border-cream-200 bg-cream-100" />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
              <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
              <div className="mt-3 h-6 w-28 animate-pulse rounded bg-cream-200" />
              <div className="mt-2 h-4 w-full animate-pulse rounded bg-cream-200" />
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-cream-200 bg-white p-4">
          <div className="space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-cream-200" />
            <div className="h-3 w-full animate-pulse rounded-full bg-cream-200" />
            <div className="h-4 w-56 animate-pulse rounded bg-cream-200" />
          </div>
        </div>

        <div className="rounded-2xl border border-cream-200 bg-white p-4">
          <div className="flex gap-2">
            <div className="h-9 w-24 animate-pulse rounded-md bg-cream-200" />
            <div className="h-9 w-24 animate-pulse rounded-md bg-cream-200" />
            <div className="h-9 w-24 animate-pulse rounded-md bg-cream-200" />
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function IntegrationsSettingsContentSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="rounded-2xl border border-cream-200 bg-cream-50 px-5 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] lg:items-center">
          <div className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-full max-w-xl animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-cream-200 bg-white px-4 py-3">
                <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
                <div className="mt-3 h-6 w-12 animate-pulse rounded bg-cream-200" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] xl:items-start">
        <section className="overflow-hidden rounded-xl border border-cream-300 bg-white shadow-xs">
          <header className="border-b border-cream-200 bg-cream-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-5 w-40 animate-pulse rounded bg-cream-200" />
                <div className="h-4 w-full max-w-lg animate-pulse rounded bg-cream-200" />
              </div>
            </div>
          </header>
          <div className="space-y-4 px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
              ))}
            </div>
            <IntegrationCardSkeleton selected />
            <IntegrationCardSkeleton />
            <IntegrationCardSkeleton />
            <IntegrationCardSkeleton />
          </div>
        </section>

        <IntegrationDetailSkeleton />
      </div>
    </div>
  );
}

export function IntegrationsSettingsPageSkeleton() {
  return (
    <div className={WRAP}>
      <div className="space-y-2" role="status" aria-label="Loading integrations settings">
        <div className="h-4 w-32 animate-pulse rounded bg-cream-200" />
        <div className="h-8 w-56 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-cream-200" />
      </div>
      <IntegrationsSettingsContentSkeleton />
    </div>
  );
}
