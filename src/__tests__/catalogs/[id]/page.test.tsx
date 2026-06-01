import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const useTenantCatalogDetailMock = vi.fn();
const useExtendCatalogValidityMock = vi.fn();
const useAddCatalogProductMock = vi.fn();
const useRemoveCatalogProductMock = vi.fn();
const useRoleMock = vi.fn();

vi.mock('@/hooks/useCatalogs', () => ({
  useTenantCatalogDetail: (...args: unknown[]) => useTenantCatalogDetailMock(...args),
  useExtendCatalogValidity: (...args: unknown[]) => useExtendCatalogValidityMock(...args),
  useAddCatalogProduct: (...args: unknown[]) => useAddCatalogProductMock(...args),
  useRemoveCatalogProduct: (...args: unknown[]) => useRemoveCatalogProductMock(...args),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: (...args: unknown[]) => useRoleMock(...args),
}));

import { CatalogDetailPage } from '@/components/seller/catalogs/detail';

const baseData = {
  header: {
    id: 'cat-1',
    name: 'Summer Pours',
    status_label: 'Draft' as const,
    status_tone: 'warning' as const,
    initials: 'SP',
    products_count: 2,
    brands_covered: 1,
    cohort_name: 'Tier A',
    valid_from_label: '01 May 2026',
    valid_until_label: '30 Jun 2026',
    valid_until_iso: '2026-06-30T00:00:00.000Z',
    published_by: 'User 1234abcd',
    share_token: 'tok',
    share_url: 'https://example.com/shop/tok',
    scope_type: 'cohort' as const,
    status_value: 'draft' as const,
  },
  meta_strip_4: {
    gmv: 100000,
    growth_pct: 12.5,
    orders: 8,
    conversion_rate: 5,
    unique_viewers: 12,
    cohort_members: 45,
    days_left: 12,
    valid_until_label: '30 Jun 2026',
  },
  composition: [
    {
      tenant_product_id: 'prod-1',
      product: 'Cabernet',
      brand: 'WineYard',
      mrp: 1200,
      catalog_price: 1000,
      override_price: 900,
      stock_status: 'In stock',
    },
  ],
  performance: {
    funnel: {
      unique_viewers: 12,
      cart_additions: 10,
      orders: 8,
      gmv: 100000,
    },
    daily: [
      { date: '2026-05-10', revenue: 20000, conversion_rate: 5 },
      { date: '2026-05-11', revenue: 30000, conversion_rate: 5.2 },
    ],
  },
  buyers: [
    {
      buyer_id: 'b-1',
      buyer_name: 'Singh Hospitality',
      status: 'Viewed',
      spend: 0,
      orders: 0,
    },
  ],
  permissions: {
    can_extend_validity: true,
    can_edit_composition: true,
  },
};

describe('catalog detail page', () => {
  beforeEach(() => {
    useTenantCatalogDetailMock.mockReturnValue({ isLoading: false, isError: false, data: baseData });
    useExtendCatalogValidityMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useAddCatalogProductMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useRemoveCatalogProductMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useRoleMock.mockReturnValue({ isSellerAdmin: true });
  });

  it('has no activity tab and shows buyers badge as cohort member count', () => {
    render(<CatalogDetailPage id="cat-1" />);

    expect(screen.queryByRole('button', { name: /Activity/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buyers 45/i })).toBeInTheDocument();
  });

  it('renders exactly four meta tiles and omits products count tile', () => {
    render(<CatalogDetailPage id="cat-1" />);

    expect(screen.getByText('GMV')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Unique viewers')).toBeInTheDocument();
    expect(screen.getByText('Days left')).toBeInTheDocument();
    expect(screen.queryByText('Products')).not.toBeInTheDocument();
  });

  it('shows extend validity only to seller_admin', () => {
    const { rerender } = render(<CatalogDetailPage id="cat-1" />);
    expect(screen.getByRole('button', { name: /Extend validity/i })).toBeInTheDocument();

    useRoleMock.mockReturnValue({ isSellerAdmin: false });
    rerender(<CatalogDetailPage id="cat-1" />);

    expect(screen.queryByRole('button', { name: /Extend validity/i })).not.toBeInTheDocument();
  });

  it('shows draft composition add/remove controls', () => {
    render(<CatalogDetailPage id="cat-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Composition/i }));

    expect(screen.getByPlaceholderText('Tenant product UUID')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add product/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Cabernet/i })).toBeInTheDocument();
  });
});
