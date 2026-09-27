import { Suspense } from 'react';
import { CatalogSetupClient } from '@/components/seller/onboarding/CatalogSetupClient';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.catalogSetup);

export default function CatalogSetupPage() {
  return (
    <Suspense fallback={null}>
      <CatalogSetupClient />
    </Suspense>
  );
}
