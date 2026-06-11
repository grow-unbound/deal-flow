// Mirrors edit product: topbar + form (same shell as new product)
export default function EditProductLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6" role="status" aria-label="Loading edit product">
      <div className="h-8 w-52 animate-pulse rounded-md bg-cream-200" />
      <div className="mx-auto max-w-4xl space-y-4 pb-12">
        <div className="h-10 w-full max-w-md animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
        <div className="flex justify-end gap-2 pt-4">
          <div className="h-10 w-24 animate-pulse rounded-[9px] bg-cream-200" />
          <div className="h-10 w-32 animate-pulse rounded-[9px] bg-cream-200" />
        </div>
      </div>
    </div>
  );
}
