// Mirrors product detail: header + hero card + body sections
export default function ProductDetailLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-cream-100" role="status" aria-label="Loading product">
      <div className="sticky top-0 z-20 flex h-[50px] items-center justify-between border-b border-cream-200 px-4 backdrop-blur-sm">
        <div className="h-9 w-9 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
        <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
        <div className="h-9 w-9 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
      </div>
      <div className="px-4 pb-6 pt-4">
        <div className="mb-4 h-48 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
        <div className="mb-2 h-6 max-w-xs animate-pulse rounded bg-cream-200" />
        <div className="mb-4 h-4 w-32 animate-pulse rounded bg-cream-200" />
        <div className="mb-4 grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
          ))}
        </div>
        <div className="h-24 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-cream-200" />
      </div>
    </div>
  );
}
