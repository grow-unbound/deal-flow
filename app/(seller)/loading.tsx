// Generic seller segment fallback — matches landing wrapper
export default function SellerLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6" role="status" aria-label="Loading seller page">
      <div className="h-10 w-72 animate-pulse rounded-md bg-cream-200" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="h-64 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
        <div className="h-64 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
      </div>
    </div>
  );
}
