export default function BuyerShopLoading() {
  return (
    <div className="p-4 space-y-4" role="status" aria-label="Loading buyer page">
      <div className="h-10 w-40 animate-pulse rounded-md bg-cream-200" />
      <div className="h-24 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
