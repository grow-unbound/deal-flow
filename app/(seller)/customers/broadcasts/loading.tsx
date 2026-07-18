export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1920px] px-8 pt-7 pb-6">
      <div className="mb-4 h-4 w-56 animate-pulse rounded bg-cream-200" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 animate-pulse rounded bg-cream-100 border border-cream-200" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-cream-200" />
        </div>
        <div className="h-10 w-36 animate-pulse rounded-lg bg-cream-100 border border-cream-200" />
      </div>
      <div className="mt-6 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-lg border border-cream-200 bg-cream-100"
          />
        ))}
      </div>
      <div className="mt-5 h-12 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
      <div className="mt-0 h-96 animate-pulse rounded-b-[14px] border border-cream-200 border-t-0 bg-cream-100" />
    </div>
  );
}
