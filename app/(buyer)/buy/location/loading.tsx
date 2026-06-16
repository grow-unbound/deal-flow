export default function BuyerLocationLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-cream-100 border border-cream-200" />
        <div className="h-7 w-40 animate-pulse rounded-md bg-cream-100" />
      </div>
      <div className="h-20 w-full animate-pulse rounded-lg bg-cream-100 border border-cream-200" />
    </div>
  );
}
