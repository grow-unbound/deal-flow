'use client';

import Link from 'next/link';
import { BookOpen, FilePen, FileText, Package, Receipt, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useSellerRealtimeContext } from '@/contexts/SellerRealtimeContext';
import type { AppNotification, NotificationKind } from '@/hooks/useNotificationStore';

const KIND_META: Record<NotificationKind, { label: string; Icon: React.ElementType }> = {
  new_estimate:     { label: 'New Estimate',     Icon: FileText },
  new_order:        { label: 'New Order',         Icon: Package },
  new_catalog:      { label: 'New Catalog',       Icon: BookOpen },
  estimate_updated: { label: 'Estimate Updated',  Icon: FilePen },
  order_updated:    { label: 'Order Updated',     Icon: Truck },
  invoice_updated:  { label: 'Invoice Updated',   Icon: Receipt },
};

function formatRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function groupNotifications(notifications: AppNotification[]): { today: AppNotification[]; earlier: AppNotification[] } {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayTs = startOfToday.getTime();
  return {
    today: notifications.filter((n) => new Date(n.createdAt).getTime() >= todayTs),
    earlier: notifications.filter((n) => new Date(n.createdAt).getTime() < todayTs),
  };
}

function NotificationRow({ n, onClose }: { n: AppNotification; onClose: () => void }) {
  const { markRead } = useSellerRealtimeContext();
  const { label, Icon } = KIND_META[n.kind];
  const isUnread = !n.readAt;

  return (
    <Link
      href={n.href}
      onClick={() => { markRead(n.id); onClose(); }}
      className="flex items-start gap-3 rounded-[10px] px-3 py-3 no-underline transition-colors hover:bg-cream-50"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-cream-100">
        <Icon size={15} strokeWidth={1.85} className="text-cream-600" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="default" className="text-[10px]">{label}</Badge>
        </div>
        <p className="mt-2 text-sm font-medium leading-snug text-cream-900">{n.title}</p>
        <p className="mt-2 text-xs text-cream-600">{n.body}</p>
        <p className="mt-2 font-mono text-[11px] tabular-nums text-cream-500">{formatRelTime(n.createdAt)}</p>
      </div>
      {isUnread && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ember-500" aria-label="Unread" />
      )}
    </Link>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SellerNotificationDrawer({ open, onClose }: Props) {
  const { notifications, markAllRead, unreadCount } = useSellerRealtimeContext();
  const { today, earlier } = groupNotifications(notifications);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="flex w-[400px] flex-col p-0">
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>Notifications</SheetTitle>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-cream-600" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-cream-700">You're all caught up</p>
              <p className="mt-1 text-xs text-cream-500">New estimates and order updates will appear here.</p>
            </div>
          ) : (
            <>
              {today.length > 0 && (
                <section>
                  <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-cream-500">Today</p>
                  {today.map((n) => <NotificationRow key={n.id} n={n} onClose={onClose} />)}
                </section>
              )}
              {earlier.length > 0 && (
                <section className={today.length > 0 ? 'mt-4' : ''}>
                  <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-cream-500">Earlier</p>
                  {earlier.map((n) => <NotificationRow key={n.id} n={n} onClose={onClose} />)}
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
