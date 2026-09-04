import { ReactNode } from 'react';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { CatalogAuthPageChrome } from '@/components/buyer/auth/CatalogAuthPageChrome';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.login);

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <CatalogAuthPageChrome>{children}</CatalogAuthPageChrome>;
}
