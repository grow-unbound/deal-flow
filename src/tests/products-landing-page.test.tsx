import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const useTenantProductsMock = vi.fn();
const useTenantProductsInfiniteMock = vi.fn();
const useTenantProductsLandingMetricsMock = vi.fn();
const useFlagMock = vi.fn();
const useRoleMock = vi.fn();
let landingProducts: Array<any> = [];
const productFilterGroups = [
  {
    key: 'brand',
    label: 'Brand',
    options: [
      { value: 'Alpha', label: 'Alpha' },
      { value: 'Beta', label: 'Beta' },
    ],
  },
  {
    key: 'category',
    label: 'Category',
    options: [{ value: 'Beverages', label: 'Beverages' }],
  },
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'Active', label: 'Active' },
      { value: 'Inactive', label: 'Inactive' },
    ],
  },
  {
    key: 'stock',
    label: 'Stock',
    options: [
      { value: 'In stock', label: 'In stock' },
      { value: 'Low stock', label: 'Low stock' },
      { value: 'Out of stock', label: 'Out of stock' },
    ],
  },
];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/products',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useProducts', () => ({
  useTenantProducts: () => useTenantProductsMock(),
  useTenantProductsLandingMetrics: (...args: unknown[]) => useTenantProductsLandingMetricsMock(...args),
  useTenantProductsInfinite: (...args: unknown[]) => useTenantProductsInfiniteMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => useRoleMock(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    tenantProfile: { role: 'seller_admin' },
    currentTenantId: 'tenant-1',
  }),
}));

vi.mock('@/components/seller/products/AddProductSheet', () => ({
  AddProductSheet: () => null,
}));

import { ProductsLandingClient } from '@/components/seller/products/ProductsLandingClient';

describe('products landing integration', () => {
  beforeEach(() => {
    useTenantProductsMock.mockReset();
    useTenantProductsInfiniteMock.mockReset();
    useTenantProductsLandingMetricsMock.mockReset();
    useFlagMock.mockReset();
    useRoleMock.mockReset();
    landingProducts = [];
    useTenantProductsLandingMetricsMock.mockReturnValue({ isLoading: false, isError: false, data: { cards: [] } });
  });

  it('renders flag-off empty state and does not fetch data when disabled', () => {
    useFlagMock.mockReturnValue(false);

    render(<ProductsLandingClient initialMetrics={null} />);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useTenantProductsMock).not.toHaveBeenCalled();
  });

  it('keeps kpis stable while filtering the table rows', () => {
    useFlagMock.mockReturnValue(true);
    useRoleMock.mockReturnValue({ isSellerAssistant: false });
    useTenantProductsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kpis: {
          active_skus: 2,
          total_skus: 2,
          archived_skus: 0,
          out_of_stock: 0,
          low_stock: 0,
          recently_sold_out_of_stock: 0,
          products_sold: 2,
          brand_count: 2,
          category_count: 1,
          revenue_mtd: 1000,
          revenue_prev_mtd: 500,
          revenue_growth_pct: 100,
        },
        products: [
          { id: 'p1', display_name: 'Alpha Water', brand_name: 'Alpha', on_hand: 10, days_cover: 30 },
          { id: 'p2', display_name: 'Beta Juice', brand_name: 'Beta', on_hand: 5, days_cover: 12 },
        ],
        brands: ['Alpha', 'Beta'],
        filters: { groups: productFilterGroups },
        todays_read: { recently_sold_out_of_stock: [], running_low: [], no_sale_90d: [] },
      },
    });
    landingProducts = [
      { id: 'p1', display_name: 'Alpha Water', brand_name: 'Alpha', category_name: 'Beverages', on_hand: 10, days_cover: 30, gmv_mtd: 1000, is_active: true },
      { id: 'p2', display_name: 'Beta Juice', brand_name: 'Beta', category_name: 'Beverages', on_hand: 5, days_cover: 12, gmv_mtd: 500, is_active: false },
    ];
    useTenantProductsInfiniteMock.mockImplementation((_period: unknown, filters: { brand?: string[]; status?: string[] }) => {
      const alphaOnly = filters?.brand?.includes('Alpha');
      const inactiveOnly = filters?.status?.includes('Inactive');
      return {
        isLoading: false,
        isError: false,
        data: {
          pages: [
            {
              products: alphaOnly
                ? [
                    { id: 'p1', display_name: 'Alpha Water', brand_name: 'Alpha', on_hand: 10, days_cover: 30, is_active: true },
                  ]
                : inactiveOnly
                  ? []
                  : [
                      { id: 'p1', display_name: 'Alpha Water', brand_name: 'Alpha', on_hand: 10, days_cover: 30, is_active: true },
                      { id: 'p2', display_name: 'Beta Juice', brand_name: 'Beta', on_hand: 5, days_cover: 12, is_active: false },
                    ],
              kpis: {
                active_skus: 2,
                total_skus: 2,
                archived_skus: 0,
                out_of_stock: 0,
                low_stock: 0,
                revenue_mtd: 1000,
                revenue_prev_mtd: 500,
                revenue_growth_pct: 100,
              },
              filters: { groups: productFilterGroups },
              nextCursor: null,
              total: alphaOnly ? 1 : inactiveOnly ? 0 : 2,
            },
          ],
        },
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      };
    });

    render(<ProductsLandingClient initialMetrics={null} />);

    expect(screen.getByText('2 products across 2 brands and 1 categories.')).toBeInTheDocument();
    expect(screen.queryByText('Stock status')).not.toBeInTheDocument();
    expect(screen.getAllByText('Alpha Water').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beta Juice').length).toBeGreaterThan(0);
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Brand: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));

    expect(screen.getByText('1 products across 2 brands and 1 categories.')).toBeInTheDocument();
    expect(screen.getAllByText('Alpha Water').length).toBeGreaterThan(0);
    expect(screen.queryByText('Beta Juice')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Status: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));
    expect(useTenantProductsInfiniteMock).toHaveBeenLastCalledWith('quarter', expect.objectContaining({ status: ['Inactive'] }));
  });

  it('deduplicates repeated products before rendering rows', () => {
    useFlagMock.mockReturnValue(true);
    useRoleMock.mockReturnValue({ isSellerAssistant: false });
    useTenantProductsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kpis: {
          active_skus: 1,
          total_skus: 1,
          archived_skus: 0,
          out_of_stock: 0,
          low_stock: 0,
          revenue_mtd: 1000,
          revenue_prev_mtd: 500,
          revenue_growth_pct: 100,
        },
        products: [
          { id: 'p1', display_name: 'Alpha Water', brand_name: 'Alpha', on_hand: 10, days_cover: 30 },
        ],
        brands: ['Alpha'],
        filters: { groups: [] },
        todays_read: { recently_sold_out_of_stock: [], running_low: [], no_sale_90d: [] },
      },
    });
    useTenantProductsInfiniteMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        pages: [
          {
            products: [
              { id: 'p1', display_name: 'Alpha Water', brand_name: 'Alpha', on_hand: 10, days_cover: 30 },
              { id: 'p1', display_name: 'Alpha Water', brand_name: 'Alpha', on_hand: 10, days_cover: 30 },
            ],
            kpis: {
              active_skus: 1,
              total_skus: 1,
              archived_skus: 0,
              out_of_stock: 0,
              low_stock: 0,
              revenue_mtd: 1000,
              revenue_prev_mtd: 500,
              revenue_growth_pct: 100,
            },
            filters: { groups: [] },
            nextCursor: null,
            total: 1,
          },
        ],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(<ProductsLandingClient initialMetrics={null} />);

    expect(screen.getAllByText('Alpha Water')).toHaveLength(2);
    expect(screen.getByText('1 of 1 products')).toBeInTheDocument();
  });

  it('renders V4 KPI cards and applies the card filter preset', async () => {
    useFlagMock.mockReturnValue(true);
    useRoleMock.mockReturnValue({ isSellerAssistant: false });
    useTenantProductsLandingMetricsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        cards: [
          {
            id: 'products-no-sale',
            label: 'Products that did not sell',
            value: 4,
            supporting_text: 'current stock units',
            filter_preset: { not_sold_period: 'this_quarter', stock_gt: 0 },
          },
        ],
      },
    });
    useTenantProductsInfiniteMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        pages: [
          {
            products: [],
            kpis: {
              active_skus: 4,
              total_skus: 4,
              archived_skus: 0,
              out_of_stock: 0,
              low_stock: 0,
              revenue_mtd: 0,
              revenue_prev_mtd: 0,
              revenue_growth_pct: 0,
            },
            filters: { groups: productFilterGroups },
            nextCursor: null,
            total: 0,
          },
        ],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(<ProductsLandingClient initialMetrics={null} />);

    expect(screen.getByText('Products that did not sell')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Products that did not sell'));

    expect(useTenantProductsInfiniteMock).toHaveBeenLastCalledWith('quarter', expect.objectContaining({
      filter_preset: { not_sold_period: 'this_quarter', stock_gt: 0 },
    }));
  });
});
