'use client';

import { Bell } from 'lucide-react';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { PageWrap } from '@/components/seller/layout';

export default function NotificationsPage() {
  return (
    <PageWrap>
      <SellerTopbar
        title="Notifications"
        subtitle="Manage alert preferences and notification channels for your workspace."
      />
      <div className="rounded-lg border border-cream-300 bg-white p-8 shadow-xs text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cream-200 text-cream-700">
          <Bell size={18} />
        </div>
        <p className="eyebrow mb-3">Notifications</p>
        <h2 className="mb-2 text-h2 font-display text-cream-900">Coming soon</h2>
        <p className="mx-auto max-w-sm text-body text-cream-600">
          Notification controls will be available in an upcoming release.
        </p>
      </div>
    </PageWrap>
  );
}
