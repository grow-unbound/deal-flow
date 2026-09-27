import { ReactNode } from 'react';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { CatalogVerifyChrome } from '@/components/buyer/auth/CatalogVerifyChrome';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.verify);

export default function VerifyLayout({ children }: { children: ReactNode }) {
  return <CatalogVerifyChrome>{children}</CatalogVerifyChrome>;
}
