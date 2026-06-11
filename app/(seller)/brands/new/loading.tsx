// Mirrors new brand form shell
export default function NewBrandLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6" role="status" aria-label="Loading new brand">
      <div className="h-8 w-36 animate-pulse rounded-md bg-cream-200" />
      <div className="mx-auto max-w-2xl space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
        <div className="h-32 w-full animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        <div className="flex justify-end gap-2 pt-2">
          <div className="h-10 w-28 animate-pulse rounded-[9px] bg-cream-200" />
        </div>
      </div>
    </div>
  );
}
