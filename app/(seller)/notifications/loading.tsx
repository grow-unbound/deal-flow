// Notifications scaffold — card list skeleton, matches NotificationRow's shape
// (icon square, badge, title, body, timestamp) so there's no layout shift on load.
export default function NotificationsLoading() {
  return (
    <div className="max-w-[1920px] mx-auto w-full px-8 py-6 space-y-5" role="status" aria-label="Loading notifications">
      <div className="h-7 w-48 animate-pulse rounded-md bg-cream-200" />
      <div className="space-y-2 max-w-2xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-[10px] border border-cream-200 bg-white px-3 py-2">
            <div className="mt-0.5 h-9 w-9 shrink-0 animate-pulse rounded-[8px] bg-cream-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-16 animate-pulse rounded-full bg-cream-100" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-cream-200" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-cream-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
