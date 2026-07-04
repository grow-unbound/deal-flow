export default function BuyerEstimateDetailLoading() {
  return (
    <div className="space-y-3 px-4 py-4" role="status" aria-label="Loading estimate">
      <div className="px-1">
        <div className="h-3 w-36 animate-pulse rounded-full bg-cream-200" />
        <div className="mt-2 h-7 w-52 animate-pulse rounded-full bg-cream-200" />
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
      <div className="h-28 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
      <div className="h-12 animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
      <div className="h-12 w-40 animate-pulse rounded-xl bg-cream-200" />
    </div>
  );
}
