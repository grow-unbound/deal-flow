'use client';
import { SellerTopbar } from '@/components/layout/SellerTopbar';

export default function settingsPage() {
  return (
    <>
      <SellerTopbar title="settings" />
      <div className="px-8 py-6" style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <div className="bg-white border border-cream-300 rounded-lg p-8 shadow-xs text-center">
          <p className="eyebrow mb-3">settings</p>
          <h2 className="text-h2 font-display text-cream-900 mb-2">Coming soon</h2>
          <p className="text-body text-cream-600 max-w-sm mx-auto">
            This module is part of the MVP build. Check back soon.
          </p>
        </div>
      </div>
    </>
  );
}
