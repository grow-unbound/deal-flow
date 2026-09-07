export default function TodayDetailLoading() {
  return (
    <div className="flex h-full flex-col gap-4 p-6" aria-hidden>
      <div className="h-7 w-48 animate-pulse rounded bg-cream-100" />
      <div className="h-40 animate-pulse rounded-[16px] bg-cream-100" />
    </div>
  );
}
