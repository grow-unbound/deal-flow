export default function BuyAgainLoading() {
  return (
    <div className="flex flex-col pb-[var(--tab-bar)]">
      <div className="border-b border-cream-200 bg-cream-50">
        <div className="h-11 animate-pulse border-b border-cream-200 bg-cream-100" />
        <div className="p-4">
          <div className="h-10 w-full animate-pulse rounded-xl bg-cream-100" />
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="h-28 animate-pulse rounded-xl bg-cream-100 border border-cream-200" />
        <div className="h-40 animate-pulse rounded-xl bg-cream-100 border border-cream-200" />
      </div>
    </div>
  );
}
