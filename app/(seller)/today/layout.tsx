import type { ReactNode } from 'react';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { EntitySplitShell } from '@/components/seller/layout';
import { InboxListClient } from '@/components/seller/inbox/InboxListClient';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.today);

export default async function TodayLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell basePath="/today" listSlot={<InboxListClient />}>
      {children}
    </EntitySplitShell>
  );
}
