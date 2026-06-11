// Short-lived redirect route — minimal landing skeleton
export default function BuyersLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-5" role="status" aria-label="Loading">
      <div className="h-7 w-40 animate-pulse rounded-md bg-cream-200" />
      <div className="h-[20rem] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
    </div>
  );
}
