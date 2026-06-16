'use client';

import Link from 'next/link';
import { BookOpen, FilePen, FileText, Package, Receipt, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageWrap } from '@/components/seller/layout';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
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

function NotificationRow({ n }: { n: AppNotification }) {
  const { markRead } = useSellerRealtimeContext();
  const { label, Icon } = KIND_META[n.kind];
  const isUnread = !n.readAt;

  return (
    <Link
      href={n.href}
      onClick={() => markRead(n.id)}
      className="flex items-start gap-3 rounded-[10px] border border-cream-200 bg-white px-4 py-3.5 no-underline transition-colors hover:bg-cream-50"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-cream-100">
        <Icon size={16} strokeWidth={1.85} className="text-cream-600" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="default" className="text-[10px]">{label}</Badge>
        </div>
        <p className="mt-1 text-sm font-medium leading-snug text-cream-900">{n.title}</p>
        <p className="mt-0.5 text-xs text-cream-600">{n.body}</p>
        <p className="mt-1 font-mono text-[11px] tabular-nums text-cream-500">{formatRelTime(n.createdAt)}</p>
      </div>
      {isUnread && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ember-500" aria-label="Unread" />
      )}
    </Link>
  );
}

export default function NotificationsPage() {
  const { notifications, markAllRead, unreadCount } = useSellerRealtimeContext();
  const { today, earlier } = groupNotifications(notifications);

  return (
    <PageWrap>
      <SellerTopbar
        title="Notifications"
        subtitle="Estimates, orders, and updates from your buyers."
        action={
          unreadCount > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 px-3 text-xs text-cream-600" onClick={markAllRead}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-cream-300 bg-white px-8 py-16 text-center shadow-xs">
          <p className="text-sm font-medium text-cream-700">You&apos;re all caught up</p>
          <p className="mt-1 text-xs text-cream-500">New estimates and order updates will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {today.length > 0 && (
            <section className="space-y-2">
              <p className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-cream-500">Today</p>
              {today.map((n) => <NotificationRow key={n.id} n={n} />)}
            </section>
          )}
          {earlier.length > 0 && (
            <section className="space-y-2">
              <p className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-cream-500">Earlier</p>
              {earlier.map((n) => <NotificationRow key={n.id} n={n} />)}
            </section>
          )}
        </div>
      )}
    </PageWrap>
  );
}
