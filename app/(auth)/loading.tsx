export default function AuthLoading() {
  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center" role="status" aria-label="Loading auth page">
      <div className="w-64 space-y-3">
        <div className="mx-auto h-10 w-10 animate-pulse rounded-md bg-teal-300" />
        <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-3/4 mx-auto animate-pulse rounded bg-cream-200" />
      </div>
    </div>
  );
}
