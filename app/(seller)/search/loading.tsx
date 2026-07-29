export default function SellerSearchLoading() {
  return (
    <div className="min-h-[calc(100dvh-56px)] bg-cream-50 md:hidden" role="status" aria-label="Loading search">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-cream-300 bg-cream-50/95 px-3 py-2">
        <div className="h-10 w-10 animate-pulse rounded-lg bg-cream-200" />
        <div className="h-10 flex-1 animate-pulse rounded-xl bg-cream-200" />
      </header>
      <div className="space-y-2 px-4 py-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-[70px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
