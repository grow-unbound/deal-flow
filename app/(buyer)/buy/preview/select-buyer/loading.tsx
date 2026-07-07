export default function Loading() {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-cream-200 bg-cream-50 p-6">
        <div className="mx-auto h-12 w-[68px] animate-pulse rounded-xl bg-cream-100" />
        <div className="h-5 w-40 animate-pulse rounded bg-cream-100" />
        <div className="h-4 w-full animate-pulse rounded bg-cream-100" />
        <div className="h-16 animate-pulse rounded-xl bg-cream-100" />
        <div className="h-16 animate-pulse rounded-xl bg-cream-100" />
      </div>
    </div>
  );
}
