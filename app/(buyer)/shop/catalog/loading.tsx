export default function CatalogLoading() {
  return (
    <div className="p-4 space-y-4" role="status" aria-label="Loading catalog">
      <div className="h-10 w-full animate-pulse rounded-xl bg-cream-200" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-cream-200" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
