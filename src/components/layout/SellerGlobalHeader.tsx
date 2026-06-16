'use client';

import { Bell, ExternalLink, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GlobalSearchOverlay } from '@/components/seller/layout/GlobalSearchOverlay';
import { SellerNotificationDrawer } from '@/components/layout/SellerNotificationDrawer';
import { useSellerRealtimeContext } from '@/contexts/SellerRealtimeContext';

function NotificationsBell({ unreadCount, onClick }: { unreadCount: number; onClick: () => void }) {
  const showBadge = unreadCount > 0;
  const label = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex rounded-[10px] p-2 text-cream-800 transition-colors duration-fast hover:bg-[var(--yk-hover-tint)]"
      aria-label="Notifications"
    >
      <Bell size={16} />
      {showBadge ? (
        <span className="absolute right-0 top-0 min-w-[14px] -translate-y-px translate-x-px rounded-full bg-ember-500 px-0.5 text-center text-xs font-bold leading-[14px] text-white">
          {label}
        </span>
      ) : null}
    </button>
  );
}

export function SellerGlobalHeader() {
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { unreadCount } = useSellerRealtimeContext();

  // ⌘K / Ctrl+K anywhere in the seller app
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <header
        className="fixed right-0 top-0 z-20 flex h-16 items-center gap-4 border-b border-cream-300 bg-[var(--bg-surface)] px-9"
        style={{ left: 'var(--sidebar-w)' }}
      >
        {/* Search trigger — clicking opens the overlay */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex max-w-[36rem] flex-1 cursor-text items-center gap-2 rounded-[16px] border border-cream-300 bg-[var(--bg-surface)] px-4 py-2 shadow-xs transition-colors hover:border-cream-400"
          aria-label="Open search"
        >
          <Search size={16} className="text-cream-600" strokeWidth={2} />
          <span className="flex-1 text-left text-sm text-cream-600">
            Search brands, products, buyers, orders…
          </span>
          <kbd className="rounded-full border border-cream-300 bg-cream-100 px-2 py-0.5 text-xs text-cream-600">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <NotificationsBell unreadCount={unreadCount} onClick={() => setDrawerOpen(true)} />
          <Button asChild variant="ghost" className="rounded-lg text-cream-800">
            <a href="/api/buyer/preview/launch" target="_blank" rel="noreferrer">
              Open buyer app <ExternalLink size={14} />
            </a>
          </Button>
        </div>
      </header>

      <GlobalSearchOverlay open={open} onOpenChange={setOpen} />
      <SellerNotificationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
