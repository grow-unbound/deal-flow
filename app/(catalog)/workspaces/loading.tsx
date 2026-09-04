export default function WorkspacesLoading() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      <div className="mb-7 flex justify-center">
        <div className="h-14 w-[76px] animate-pulse rounded-xl border border-cream-200 bg-cream-100" />
      </div>
      <div className="mx-auto mb-8 h-8 w-56 animate-pulse rounded border border-cream-200 bg-cream-100" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-cream-200 bg-white">
            <div className="aspect-[16/9] animate-pulse border-b border-cream-200 bg-cream-100" />
            <div className="space-y-3 p-6">
              <div className="h-5 w-2/3 animate-pulse rounded border border-cream-200 bg-cream-100" />
              <div className="h-11 w-full animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
