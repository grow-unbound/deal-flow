const WRAP = 'max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6';

export default function SettingsBillingLoading() {
  return (
    <div className={WRAP}>
      <div className="space-y-2" role="status" aria-label="Loading billing settings">
        <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
        <div className="h-9 w-64 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-cream-200" />
      </div>

      <div className="h-52 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />

      <section className="overflow-hidden rounded-xl border border-cream-200 bg-cream-100">
        <header className="border-b border-cream-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-52 animate-pulse rounded bg-cream-200" />
              <div className="h-4 w-full max-w-lg animate-pulse rounded bg-cream-200" />
            </div>
          </div>
        </header>
        <div className="px-5 py-5">
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded border border-cream-200 bg-cream-100" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded border border-cream-200 bg-cream-100" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
