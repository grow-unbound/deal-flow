import type { ReactNode } from 'react';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';
import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { ProductsWorkspaceShell } from '@/components/seller/products/ProductsWorkspaceShell';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.products);

// Note: `?search=` seeding now happens client-side inside ProductsLandingClient via
// useSearchParams() — layouts (unlike page.tsx) don't receive `searchParams` from
// Next.js, and the list now lives here so it can stay mounted across /products <-> /products/[id].
export default async function ProductsLayout({ children }: { children: ReactNode }) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) return <RoleForbiddenPage />;

  return <ProductsWorkspaceShell canManageTaxonomy={claims.role === 'seller_admin'}>{children}</ProductsWorkspaceShell>;
}
