export default function Loading() {
  return (
    <div className="space-y-4 p-4" role="status" aria-label="Loading">
      <div className="h-12 w-full animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
