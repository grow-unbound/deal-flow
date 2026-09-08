export default function CatalogsLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-5" role="status" aria-label="Loading catalogs">
      <div className="space-y-2">
        <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
        <div className="h-8 w-40 animate-pulse rounded bg-cream-100 border border-cream-200" />
        <div className="h-4 w-[32rem] max-w-full animate-pulse rounded bg-cream-200" />
      </div>
      <div className="h-64 animate-pulse rounded-[12px] bg-cream-100 border border-cream-200" />
    </div>
  );
}
