// Notifications scaffold — card list skeleton
export default function NotificationsLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-5" role="status" aria-label="Loading notifications">
      <div className="h-7 w-48 animate-pulse rounded-md bg-cream-200" />
      <div className="space-y-3 max-w-2xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
