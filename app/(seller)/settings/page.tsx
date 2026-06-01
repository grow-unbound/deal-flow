import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { PageWrap } from '@/components/seller/layout';

export default async function SettingsPage() {
  const h = await headers();
  const role = h.get('x-verified-role');

  if (role !== 'seller_admin') {
    redirect('/dashboard');
  }

  return (
    <PageWrap>
      <SellerTopbar
        title="Settings"
        subtitle="Configure tenant-level preferences and workspace administration settings."
      />
      <div className="bg-white border border-cream-300 rounded-lg p-8 shadow-xs text-center">
        <p className="eyebrow mb-3">Settings</p>
        <h2 className="text-h2 font-display text-cream-900 mb-2">Coming soon</h2>
        <p className="text-body text-cream-600 max-w-sm mx-auto">
          This module is part of the MVP build. Check back soon.
        </p>
      </div>
    </PageWrap>
  );
}
