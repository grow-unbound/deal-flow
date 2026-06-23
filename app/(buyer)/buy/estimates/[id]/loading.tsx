export default function BuyerEstimateDetailLoading() {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading estimate">
      <div className="h-10 w-full animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
      <div className="h-32 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-32 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
        <div className="h-32 animate-pulse rounded-2xl border border-cream-200 bg-cream-100" />
      </div>
    </div>
  );
}
