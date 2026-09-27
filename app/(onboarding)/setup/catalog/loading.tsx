export default function CatalogSetupLoading() {
  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-cream-50">
      <div className="flex shrink-0 items-start gap-4 border-b border-cream-200 bg-white px-6 py-3">
        <div className="mt-0.5 h-8 w-8 shrink-0 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-48 animate-pulse rounded bg-cream-200" />
          <div className="mt-2 flex items-center gap-3">
            <div className="h-3 w-36 shrink-0 animate-pulse rounded bg-cream-200" />
            <div className="h-1.5 min-w-[5rem] max-w-[14rem] flex-1 animate-pulse rounded-full bg-cream-100" />
          </div>
        </div>
        <div className="h-8 w-20 shrink-0 animate-pulse rounded-[10px] bg-cream-100" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <div className="h-8 w-72 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-cream-200" />
          <div className="mt-6 h-24 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
          <div className="mt-8 h-48 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-cream-200 bg-white px-6 py-3">
        <div className="h-10 w-24 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
        <div className="h-10 w-36 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
      </div>
    </div>
  );
}
