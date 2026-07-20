export default function PromotionsLoading() {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading promotions">
      <div className="h-10 w-full animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-[12px] border border-cream-200 bg-cream-100">
          <div className="aspect-[15/8] w-full animate-pulse bg-cream-100" />
          <div className="space-y-2 bg-cream-50 px-4 py-3">
            <div className="h-5 w-2/3 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
