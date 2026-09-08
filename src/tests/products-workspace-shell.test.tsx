import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const navigationState = vi.hoisted(() => ({
  pathname: '/products',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock('@/components/seller/layout', () => ({
  EntitySplitShell: ({
    basePath,
    listSlot,
    children,
  }: {
    basePath: string;
    listSlot: ReactNode;
    children: ReactNode;
  }) => (
    <section data-testid="split-shell" data-base-path={basePath}>
      <div data-testid="list-slot">{listSlot}</div>
      <div data-testid="detail-slot">{children}</div>
    </section>
  ),
}));

vi.mock('@/components/seller/layout/ForbiddenPage', () => ({
  RoleForbiddenPage: () => <div>role-forbidden</div>,
}));

vi.mock('@/components/seller/products/ProductsLandingClient', () => ({
  ProductsLandingClient: () => <div>products-list</div>,
}));

vi.mock('@/components/seller/brands/BrandsLandingClient', () => ({
  BrandsLandingClient: () => <div>brands-list</div>,
}));

vi.mock('@/components/seller/categories/CategoriesLandingClient', () => ({
  CategoriesLandingClient: () => <div>categories-list</div>,
}));

import { ProductsWorkspaceShell } from '@/components/seller/products/ProductsWorkspaceShell';

describe('ProductsWorkspaceShell', () => {
  it('uses the products list for the root products workspace', () => {
    navigationState.pathname = '/products';

    render(<ProductsWorkspaceShell canManageTaxonomy>detail</ProductsWorkspaceShell>);

    expect(screen.getByTestId('split-shell')).toHaveAttribute('data-base-path', '/products');
    expect(screen.getByText('products-list')).toBeInTheDocument();
  });

  it('uses the brands list for the brands workspace and detail routes', () => {
    navigationState.pathname = '/products/brands/brand-1';

    render(<ProductsWorkspaceShell canManageTaxonomy>brand-detail</ProductsWorkspaceShell>);

    expect(screen.getByTestId('split-shell')).toHaveAttribute('data-base-path', '/products/brands');
    expect(screen.getByText('brands-list')).toBeInTheDocument();
    expect(screen.getByText('brand-detail')).toBeInTheDocument();
  });

  it('uses the categories list for the categories workspace', () => {
    navigationState.pathname = '/products/categories';

    render(<ProductsWorkspaceShell canManageTaxonomy>detail</ProductsWorkspaceShell>);

    expect(screen.getByTestId('split-shell')).toHaveAttribute('data-base-path', '/products/categories');
    expect(screen.getByText('categories-list')).toBeInTheDocument();
  });

  it('keeps taxonomy lists admin-only', () => {
    navigationState.pathname = '/products/brands';

    render(<ProductsWorkspaceShell canManageTaxonomy={false}>detail</ProductsWorkspaceShell>);

    expect(screen.getByTestId('split-shell')).toHaveAttribute('data-base-path', '/products/brands');
    expect(screen.getByText('role-forbidden')).toBeInTheDocument();
    expect(screen.queryByText('brands-list')).not.toBeInTheDocument();
  });
});
