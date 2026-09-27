'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { EntitySplitShell } from '@/components/seller/layout';
import { BrandsLandingClient } from '@/components/seller/brands/BrandsLandingClient';
import { CategoriesLandingClient } from '@/components/seller/categories/CategoriesLandingClient';
import { ProductsLandingClient } from '@/components/seller/products/ProductsLandingClient';
import { SELLER_ROUTES } from '@/lib/seller-routes';

interface ProductsWorkspaceShellProps {
  children: ReactNode;
  canManageTaxonomy: boolean;
}

function activeProductsWorkspace(pathname: string) {
  if (pathname.startsWith(SELLER_ROUTES.products.brands)) {
    return {
      basePath: SELLER_ROUTES.products.brands,
      listSlot: <BrandsLandingClient initialMetrics={null} />,
    };
  }

  if (pathname.startsWith(SELLER_ROUTES.products.categories)) {
    return {
      basePath: SELLER_ROUTES.products.categories,
      listSlot: <CategoriesLandingClient initialMetrics={null} />,
    };
  }

  return {
    basePath: SELLER_ROUTES.products.root,
    listSlot: <ProductsLandingClient initialMetrics={null} />,
  };
}

export function ProductsWorkspaceShell({ children, canManageTaxonomy }: ProductsWorkspaceShellProps) {
  const pathname = usePathname();
  const workspace = activeProductsWorkspace(pathname);
  const isTaxonomyRoute = workspace.basePath !== SELLER_ROUTES.products.root;
  const listSlot = isTaxonomyRoute && !canManageTaxonomy ? <RoleForbiddenPage /> : workspace.listSlot;

  return (
    <EntitySplitShell basePath={workspace.basePath} listSlot={listSlot}>
      {children}
    </EntitySplitShell>
  );
}
