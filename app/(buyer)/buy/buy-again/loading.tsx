export default function BuyAgainLoading() {
  return (
    <div className="space-y-4 p-4" role="status" aria-label="Loading order again">
      <div className="h-10 w-full animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="h-5 w-28 animate-pulse rounded bg-cream-200" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="aspect-[4/5] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
