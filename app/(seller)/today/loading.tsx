export default function TodayLoading() {
  return (
    <div className="flex h-full flex-col gap-3 p-4" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-[12px] bg-cream-100" />
      ))}
    </div>
  );
}
