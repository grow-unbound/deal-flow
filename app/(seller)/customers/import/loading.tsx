// Mirrors customer CSV import stepped flow
export default function CustomerImportLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6" role="status" aria-label="Loading customer import">
      <div className="h-8 w-52 animate-pulse rounded-md bg-cream-200" />
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-cream-200" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        <div className="h-11 w-full animate-pulse rounded-[9px] bg-cream-200" />
      </div>
    </div>
  );
}
