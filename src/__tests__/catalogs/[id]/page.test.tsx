import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const useTenantCatalogDetailMock = vi.fn();
const usePublishCatalogMock = vi.fn();
const useEnsureCatalogShareLinkMock = vi.fn();
const useAddCatalogProductMock = vi.fn();
const useRemoveCatalogProductMock = vi.fn();
const useRoleMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@/hooks/useCatalogs', () => ({
  useTenantCatalogDetail: (...args: unknown[]) => useTenantCatalogDetailMock(...args),
  usePublishCatalog: (...args: unknown[]) => usePublishCatalogMock(...args),
  useEnsureCatalogShareLink: (...args: unknown[]) => useEnsureCatalogShareLinkMock(...args),
  useAddCatalogProduct: (...args: unknown[]) => useAddCatalogProductMock(...args),
  useRemoveCatalogProduct: (...args: unknown[]) => useRemoveCatalogProductMock(...args),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: (...args: unknown[]) => useRoleMock(...args),
}));

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useRouter: () => ({ push: pushMock }),
    usePathname: () => '/catalogs/cat-1',
  };
});

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
    share_url: 'https://example.com/buy/tok',
    scope_type: 'cohort' as const,
    status_value: 'draft' as const,
    selected_cohort: {
      id: 'cohort-1',
      name: 'Tier A',
      member_count: 45,
      scope_type: 'cohort' as const,
      display_label: 'Tier A',
    },
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
  products_summary: {
    filters: {
      brand_names: ['WineYard'],
      category_names: ['Red wine'],
      availability: 'show_everything' as const,
    },
    included_count: 1,
    brands_covered: 1,
    in_stock_count: 1,
    tag_overrides_count: 0,
  },
  products: [
    {
      tenant_product_id: 'prod-1',
      product_name: 'Cabernet',
      internal_sku: 'CAB-01',
      brand_name: 'WineYard',
      stock_label: '24',
      stock_tone: 'success' as const,
      mrp: 1200,
      base_selling_price: 1000,
      catalog_gmv: 50000,
      catalog_units_sold: 24,
      units_mtd: 18,
      days_cover: 12,
      tag: 'new' as const,
      override_price: 900,
      catalog_order: 0,
    },
  ],
  performance: {
    summary: {
      orders: 8,
      gmv: 100000,
      growth_pct: 12.5,
      aov: 12500,
      views: 24,
      unique_viewers: 12,
      conversion_rate: 5,
      abandoners: 4,
      valid_until_label: '30 Jun 2026',
      published_at_label: '01 May 2026',
    },
    funnel: {
      unique_viewers: 12,
      conversions: 8,
      orders: 6,
      estimates: 2,
      gmv: 100000,
    },
    daily: [
      { date: '2026-05-10', revenue: 20000, conversion_rate: 5 },
      { date: '2026-05-11', revenue: 30000, conversion_rate: 5.2 },
    ],
    cumulative_orders: [
      { date: '2026-05-10', orders_cumulative: 3, gmv_cumulative: 20000 },
      { date: '2026-05-11', orders_cumulative: 8, gmv_cumulative: 50000 },
    ],
    top_skus: [
      {
        tenant_product_id: 'prod-1',
        product_name: 'Cabernet',
        internal_sku: 'CAB-01',
        gmv: 50000,
        units: 24,
      },
    ],
    per_buyer_activity: [
      {
        buyer_id: 'b-1',
        buyer_name: 'Singh Hospitality',
        city: 'Delhi',
        opened_status: 'Opened' as const,
        orders: 0,
        gmv: 0,
        last_opened_at: '2026-05-10T00:00:00.000Z',
        last_order_at: null,
      },
    ],
  },
  buyers: [
    {
      buyer_id: 'b-1',
      buyer_name: 'Singh Hospitality',
      city: 'Delhi',
      cohort_label: 'Tier A',
      opened_status: 'Opened' as const,
      spend: 0,
      orders: 0,
      last_opened_at: '2026-05-10T00:00:00.000Z',
      last_order_at: null,
    },
  ],
  permissions: {
    can_extend_validity: true,
    can_edit_composition: true,
  },
};

describe('catalog detail page', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    useTenantCatalogDetailMock.mockReturnValue({ isLoading: false, isError: false, data: baseData });
    usePublishCatalogMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        ok: true,
        share_link: { share_token: 'tok', share_url: 'https://example.com/buy/catalog?share_token=tok' },
      }),
      isPending: false,
    });
    useEnsureCatalogShareLinkMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        share_link: { share_token: 'tok', share_url: 'https://example.com/buy/catalog?share_token=tok' },
      }),
      isPending: false,
    });
    useAddCatalogProductMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useRemoveCatalogProductMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useRoleMock.mockReturnValue({ isSellerAdmin: true });
    pushMock.mockReset();
  });

  it('has no activity tab and shows buyers badge as cohort member count', () => {
    render(<CatalogDetailPage id="cat-1" />);

    expect(screen.queryByRole('button', { name: /Activity/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buyers\s*45/i })).toBeInTheDocument();
  });

  it('renders exactly four meta tiles and omits products count tile', () => {
    render(<CatalogDetailPage id="cat-1" />);

    expect(screen.getByText('GMV')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Unique viewers')).toBeInTheDocument();
    expect(screen.getByText('Days left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Products/i })).toBeInTheDocument();
  });

  it('shows edit and publish actions for draft catalogs', () => {
    const { rerender } = render(<CatalogDetailPage id="cat-1" />);
    expect(screen.getByRole('button', { name: /Edit Catalog/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publish Catalog/i })).toBeInTheDocument();

    useRoleMock.mockReturnValue({ isSellerAdmin: false });
    rerender(<CatalogDetailPage id="cat-1" />);

    expect(screen.queryByRole('button', { name: /Edit Catalog/i })).not.toBeInTheDocument();
  });

  it('renames composition to products and shows the read-only products tab', () => {
    render(<CatalogDetailPage id="cat-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Products/i }));

    expect(screen.getByText('Filters applied')).toBeInTheDocument();
    expect(screen.getByText('Product Name')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Tenant product UUID')).not.toBeInTheDocument();
  });

  it('opens the edit composer route from the detail header', () => {
    render(<CatalogDetailPage id="cat-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Edit Catalog/i }));

    expect(pushMock).toHaveBeenCalledWith('/catalogs/cat-1/edit');
  });

  it('shows buyer-app and copy-link actions for published catalogs', async () => {
    useTenantCatalogDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...baseData,
        header: {
          ...baseData.header,
          status_label: 'Live',
          status_tone: 'success',
          status_value: 'published',
        },
        permissions: {
          ...baseData.permissions,
          can_edit_composition: false,
        },
      },
    });

    render(<CatalogDetailPage id="cat-1" />);

    expect(screen.getByRole('button', { name: /Edit Catalog/i })).toBeInTheDocument();
    const buyerAppLink = screen.getByRole('link', { name: /View in Buyer App/i });
    expect(buyerAppLink).toHaveAttribute('href', '/api/buyer/preview/launch?share_token=tok');
    expect(buyerAppLink).toHaveAttribute('target', '_blank');

    fireEvent.click(screen.getByRole('button', { name: /Copy link/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/buy/catalog?share_token=tok');
    });
  });
});
