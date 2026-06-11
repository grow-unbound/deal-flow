// Legacy redirect route — minimal skeleton during navigation
export default function AccountLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center p-4" role="status" aria-label="Loading">
      <div className="h-8 w-40 animate-pulse rounded-md bg-cream-200" />
    </div>
  );
}
