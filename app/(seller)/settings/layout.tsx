import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { PageWrap } from '@/components/seller/layout';
import { SellerSettingsWorkspaceTabs } from '@/components/seller/layout/SellerWorkspaceTabSets';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.settings);

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  if (h.get('x-verified-role') !== 'seller_admin') {
    return <RoleForbiddenPage />;
  }
  return (
    <PageWrap>
      <SellerTopbar
        eyebrow="Settings"
        title="Settings"
        subtitle="Configure business defaults, integrations, billing, and system preferences."
      />
      <SellerSettingsWorkspaceTabs />
      <div className="mt-6">{children}</div>
    </PageWrap>
  );
}
