export default function Loading() {
  return (
    <div className="rounded-xl border border-cream-300 bg-white p-8 shadow-md">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-full max-w-sm animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-cream-200" />
      </div>
      <div className="mb-4 h-4 w-64 animate-pulse rounded bg-cream-200" />
      <div className="space-y-4">
        <div className="h-10 w-full animate-pulse rounded bg-cream-200" />
        <div className="h-10 w-full animate-pulse rounded bg-cream-200" />
      </div>
    </div>
  );
}
