// Mirrors edit customer form (same shell as new)
export default function EditCustomerLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6" role="status" aria-label="Loading edit customer">
      <div className="h-8 w-48 animate-pulse rounded-md bg-cream-200" />
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
          ))}
        </div>
        <div className="h-24 w-full animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        <div className="flex justify-end gap-2 pt-2">
          <div className="h-10 w-32 animate-pulse rounded-[9px] bg-cream-200" />
        </div>
      </div>
    </div>
  );
}
