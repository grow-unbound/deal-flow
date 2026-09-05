export default function NotLiveLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-cream-50 p-6">
      <div className="w-full max-w-md space-y-4 rounded-[20px] border border-cream-200 bg-white p-8">
        <div className="mx-auto h-10 w-40 animate-pulse rounded-lg bg-cream-100" />
        <div className="mx-auto h-5 w-64 animate-pulse rounded bg-cream-200" />
        <div className="mx-auto h-4 w-48 animate-pulse rounded bg-cream-200" />
      </div>
    </div>
  );
}
