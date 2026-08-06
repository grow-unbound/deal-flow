import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantProductsMock = vi.fn();
const useTenantProductsInfiniteMock = vi.fn();
const useTenantProductsLandingMetricsMock = vi.fn();
const useFlagMock = vi.fn();
let landingProducts: Array<any> = [];
const productFilterGroups = [
  {
    key: 'brand',
    label: 'Brand',
    options: [
      { value: 'Red wine', label: 'Red wine' },
      { value: 'Beer', label: 'Beer' },
    ],
  },
  {
    key: 'category',
    label: 'Category',
    options: [{ value: 'Wine', label: 'Wine' }],
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
  useRouter: () => ({ push: pushMock }),
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

describe('products landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useTenantProductsMock.mockReset();
    useTenantProductsInfiniteMock.mockReset();
    useTenantProductsLandingMetricsMock.mockReset();
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
    useTenantProductsLandingMetricsMock.mockReturnValue({ isLoading: false, isError: false, data: { cards: [] } });
    useTenantProductsInfiniteMock.mockImplementation((_period: unknown, filters: { brand?: string[]; category?: string[]; status?: string[]; stock?: string[] }) => {
      const filtered = landingProducts.filter((product) => {
        const brandMatch = !filters.brand?.length || (product.brand_name ? filters.brand.includes(product.brand_name) : false);
        const categoryMatch = !filters.category?.length || (product.category_name ? filters.category.includes(product.category_name) : false);
        const statusMatch =
          !filters.status?.length ||
          filters.status.some((value) => (value === 'Active' ? product.is_active !== false : value === 'Inactive' ? product.is_active === false : false));
        const stockMatch =
          !filters.stock?.length ||
          filters.stock.some((value) => {
            const onHand = Number(product.on_hand ?? 0);
            const daysCover = Number(product.days_cover ?? 0);
            if (value === 'Out of stock') return onHand === 0;
            if (value === 'Low stock') return onHand > 0 && daysCover < 14;
            if (value === 'In stock') return onHand > 0 && daysCover >= 14;
            return false;
          });
        return brandMatch && categoryMatch && statusMatch && stockMatch;
      });

      return {
        isLoading: false,
        isError: false,
        data: {
          pages: [
            {
              products: filtered,
              total: filtered.length,
              filters: { groups: productFilterGroups },
              kpis: {
                active_skus: filtered.filter((product) => product.is_active !== false).length,
                total_skus: filtered.length,
                archived_skus: filtered.filter((product) => product.is_active === false).length,
                out_of_stock: filtered.filter((product) => Number(product.on_hand ?? 0) === 0).length,
                low_stock: filtered.filter((product) => Number(product.on_hand ?? 0) > 0 && Number(product.days_cover ?? 0) < 14).length,
                revenue_mtd: filtered.reduce((sum, product) => sum + Number(product.gmv_mtd ?? 0), 0),
                revenue_prev_mtd: 0,
                revenue_growth_pct: 0,
              },
              nextCursor: null,
            },
          ],
        },
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      };
    });
  });

  it('shows backend recently-sold-out-of-stock KPI count', () => {
    useTenantProductsLandingMetricsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        cards: [
          {
            id: 'recently-oos',
            label: 'Recently sold, now out of stock',
            value: 3,
            supporting_text: '21% of all products',
            filter_preset: { sold_period: 'this_quarter', stock: 'out' },
          },
        ],
      },
    });
    landingProducts = [];

    render(<ProductsLandingClient initialMetrics={null} />);

    expect(screen.getByText('Recently sold, now out of stock')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('applies days cover coloring rules in table', () => {
    useTenantProductsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        brands: ['Red wine'],
        products: [
          {
            id: 'p0',
            display_name: 'Zero Cover',
            internal_sku: 'Z-0',
            master_product: { master_sku: 'MS-0' },
            brand_name: 'Red wine',
            category_name: 'Wine',
            on_hand: 0,
            days_cover: 0,
            units_mtd: 0,
            gmv_mtd: 0,
            growth_pct: -10,
            status_tone: 'danger',
            status_label: 'Out of stock',
          },
          {
            id: 'p5',
            display_name: 'Five Cover',
            internal_sku: 'Z-5',
            master_product: { master_sku: 'MS-5' },
            brand_name: 'Red wine',
            category_name: 'Wine',
            on_hand: 12,
            days_cover: 5,
            units_mtd: 5,
            gmv_mtd: 1000,
            growth_pct: 0,
            status_tone: 'warning',
            status_label: 'Low stock',
          },
          {
            id: 'p20',
            display_name: 'Twenty Cover',
            internal_sku: 'Z-20',
            master_product: { master_sku: 'MS-20' },
            brand_name: 'Red wine',
            category_name: 'Wine',
            on_hand: 40,
            days_cover: 20,
            units_mtd: 10,
            gmv_mtd: 2000,
            growth_pct: 10,
            status_tone: 'success',
            status_label: 'On pace',
          },
        ],
        filters: { groups: productFilterGroups },
      },
    });
    landingProducts = [
      { id: 'p0', display_name: 'Zero Cover', internal_sku: 'Z-0', master_product: { master_sku: 'MS-0' }, brand_name: 'Red wine', category_name: 'Wine', on_hand: 0, days_cover: 0, units_mtd: 0, gmv_mtd: 0, growth_pct: -10, status_tone: 'danger', status_label: 'Out of stock', is_active: false },
      { id: 'p5', display_name: 'Five Cover', internal_sku: 'Z-5', master_product: { master_sku: 'MS-5' }, brand_name: 'Red wine', category_name: 'Wine', on_hand: 12, days_cover: 5, units_mtd: 5, gmv_mtd: 1000, growth_pct: 0, status_tone: 'warning', status_label: 'Low stock', is_active: true },
      { id: 'p20', display_name: 'Twenty Cover', internal_sku: 'Z-20', master_product: { master_sku: 'MS-20' }, brand_name: 'Red wine', category_name: 'Wine', on_hand: 40, days_cover: 20, units_mtd: 10, gmv_mtd: 2000, growth_pct: 10, status_tone: 'success', status_label: 'On pace', is_active: true },
    ];

    render(<ProductsLandingClient initialMetrics={null} />);

    expect(screen.getByText('0d')).toHaveClass('text-danger-700');
    expect(screen.getByText('5d')).toHaveClass('text-warning-700');
    expect(screen.getByText('20d')).not.toHaveClass('text-warning-700');
  });

  it('Stock filter options filter products with days_cover < 14 and on_hand > 0', () => {
    useTenantProductsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        brands: ['Red wine', 'Beer'],
        products: [
          { id: 'p1', display_name: 'Low but available', internal_sku: 'L1', master_product: { master_sku: 'L1' }, brand_name: 'Red wine', category_name: 'Wine', on_hand: 3, days_cover: 6, units_mtd: 20, gmv_mtd: 1000, growth_pct: -2, status_tone: 'warning', status_label: 'Low stock' },
          { id: 'p2', display_name: 'Out of stock', internal_sku: 'O2', master_product: { master_sku: 'O2' }, brand_name: 'Beer', category_name: 'Beer', on_hand: 0, days_cover: 0, units_mtd: 0, gmv_mtd: 500, growth_pct: -10, status_tone: 'danger', status_label: 'Out of stock' },
          { id: 'p3', display_name: 'Healthy', internal_sku: 'H3', master_product: { master_sku: 'H3' }, brand_name: 'Red wine', category_name: 'Wine', on_hand: 22, days_cover: 20, units_mtd: 4, gmv_mtd: 1200, growth_pct: 4, status_tone: 'success', status_label: 'On pace' },
        ],
        filters: { groups: productFilterGroups },
      },
    });
    landingProducts = [
      { id: 'p1', display_name: 'Low but available', internal_sku: 'L1', master_product: { master_sku: 'L1' }, brand_name: 'Red wine', category_name: 'Wine', on_hand: 3, days_cover: 6, units_mtd: 20, gmv_mtd: 1000, growth_pct: -2, status_tone: 'warning', status_label: 'Low stock', is_active: true },
      { id: 'p2', display_name: 'Out of stock', internal_sku: 'O2', master_product: { master_sku: 'O2' }, brand_name: 'Beer', category_name: 'Beer', on_hand: 0, days_cover: 0, units_mtd: 0, gmv_mtd: 500, growth_pct: -10, status_tone: 'danger', status_label: 'Out of stock', is_active: false },
      { id: 'p3', display_name: 'Healthy', internal_sku: 'H3', master_product: { master_sku: 'H3' }, brand_name: 'Red wine', category_name: 'Wine', on_hand: 22, days_cover: 20, units_mtd: 4, gmv_mtd: 1200, growth_pct: 4, status_tone: 'success', status_label: 'On pace', is_active: true },
    ];

    render(<ProductsLandingClient initialMetrics={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stock: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Low stock' }));

    expect(screen.getAllByText('Low but available').length).toBeGreaterThan(0);
    expect(useTenantProductsInfiniteMock).toHaveBeenLastCalledWith('quarter', expect.objectContaining({ stock: ['Low stock'] }));
    expect(screen.getByRole('button', { name: 'Stock: Low stock' })).toBeInTheDocument();
  });

});
