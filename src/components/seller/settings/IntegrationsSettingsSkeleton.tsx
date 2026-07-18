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

export function IntegrationsSettingsContentSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-4">
        <IntegrationCardSkeleton selected />
        <IntegrationCardSkeleton />
        <IntegrationCardSkeleton />
        <IntegrationCardSkeleton />
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
