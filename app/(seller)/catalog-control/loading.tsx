export default function CatalogLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-5" role="status" aria-label="Loading catalog">
      <div className="flex items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="h-8 w-40 animate-pulse rounded bg-cream-100 border border-cream-200" />
          <div className="h-4 w-[34rem] max-w-full animate-pulse rounded bg-cream-200" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-32 animate-pulse rounded-[8px] bg-cream-100 border border-cream-200" />
          <div className="h-9 w-40 animate-pulse rounded-[8px] bg-cream-100 border border-cream-200" />
        </div>
      </div>
      <div className="h-12 animate-pulse rounded-[8px] bg-cream-100 border border-cream-200" />
      <div className="h-36 animate-pulse rounded-[8px] bg-cream-100 border border-cream-200" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="h-44 animate-pulse rounded-[8px] bg-cream-100 border border-cream-200" />
          <div className="h-64 animate-pulse rounded-[8px] bg-cream-100 border border-cream-200" />
        </div>
        <div className="h-[680px] animate-pulse rounded-[8px] bg-cream-100 border border-cream-200" />
      </div>
    </div>
  );
}
