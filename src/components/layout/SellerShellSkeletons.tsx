// Suspense fallbacks for SellerSidebar/SellerGlobalHeader while their
// featureAvailability/tenantBranding promises are still resolving. Reserve the
// same fixed-position frame/dimensions as the real components so there's no
// layout shift when the real content swaps in.

const NAV_GROUP_ROW_COUNTS = [6, 8, 5] as const;

export function SellerSidebarSkeleton({ isCollapsed = false }: { isCollapsed?: boolean }) {
  return (
    <aside
      className="fixed left-0 top-0 flex h-screen flex-col border-r border-cream-300 bg-cream-100"
      style={{ width: 'var(--sidebar-w)' }}
      aria-hidden
    >
      <div className="flex h-14 shrink-0 items-center border-b border-cream-300 px-3">
        <div className={isCollapsed ? 'h-7 w-7 animate-pulse rounded-md bg-cream-300' : 'h-8 w-[138px] animate-pulse rounded-md bg-cream-300'} />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {NAV_GROUP_ROW_COUNTS.map((rowCount, groupIndex) => (
          <div key={groupIndex} className={groupIndex > 0 ? 'pt-5' : undefined}>
            {!isCollapsed && <div className="mb-2 h-3 w-16 animate-pulse rounded bg-cream-200" />}
            <div className="space-y-0.5">
              {Array.from({ length: rowCount }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-[12px] bg-cream-200" />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function SellerGlobalHeaderSkeleton() {
  return (
    <header
      className="fixed right-0 top-0 z-20 flex h-14 items-center gap-4 border-b border-cream-300 bg-[var(--bg-surface)] px-6"
      style={{ left: 'var(--sidebar-w)' }}
      aria-hidden
    >
      <div className="h-9 flex-[1_1_0%] max-w-[min(50vw,40rem)] animate-pulse rounded-[12px] bg-cream-100" />
      <div className="ml-auto flex items-center gap-2">
        <div className="h-9 w-9 animate-pulse rounded-full bg-cream-200" />
      </div>
    </header>
  );
}
