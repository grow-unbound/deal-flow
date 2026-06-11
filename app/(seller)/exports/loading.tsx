export default function ExportsLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-6">
      <div className="space-y-6" role="status" aria-label="Loading exports page">
        <div className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
          <div className="h-8 w-52 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-[30rem] max-w-full animate-pulse rounded bg-cream-200" />
        </div>

        <div className="rounded-xl border border-cream-200 bg-cream-100 p-5">
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-cream-200" />
        </div>
      </div>
    </div>
  );
}
