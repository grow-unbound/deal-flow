import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.settings);

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  if (h.get('x-verified-role') !== 'seller_admin') {
    return <RoleForbiddenPage />;
  }
  return children;
}
