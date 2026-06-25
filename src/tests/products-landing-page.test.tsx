import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const useTenantProductsMock = vi.fn();
const useTenantProductsInfiniteMock = vi.fn();
const useFlagMock = vi.fn();
const useRoleMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/products',
}));

vi.mock('@/hooks/useProducts', () => ({
  useTenantProducts: () => useTenantProductsMock(),
  useTenantProductsInfinite: (...args: unknown[]) => useTenantProductsInfiniteMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => useRoleMock(),
}));

vi.mock('@/components/seller/products/AddProductSheet', () => ({
  AddProductSheet: () => null,
}));

import { ProductsLandingClient } from '@/components/seller/products/ProductsLandingClient';

describe('products landing integration', () => {
  beforeEach(() => {
    useTenantProductsMock.mockReset();
    useTenantProductsInfiniteMock.mockReset();
    useFlagMock.mockReset();
    useRoleMock.mockReset();
  });

  it('renders flag-off empty state and does not fetch data when disabled', () => {
    useFlagMock.mockReturnValue(false);

    render(<ProductsLandingClient initialData={null} initialPeriod="month" />);

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
          revenue_mtd: 1000,
          revenue_prev_mtd: 500,
          revenue_growth_pct: 100,
        },
        products: [
          { id: 'p1', display_name: 'Alpha Water', brand_name: 'Alpha', on_hand: 10, days_cover: 30 },
          { id: 'p2', display_name: 'Beta Juice', brand_name: 'Beta', on_hand: 5, days_cover: 12 },
        ],
        brands: ['Alpha', 'Beta'],
        filters: {
          groups: [
            {
              key: 'brand',
              label: 'Brand',
              options: [
                { value: 'Alpha', label: 'Alpha' },
                { value: 'Beta', label: 'Beta' },
              ],
            },
          ],
        },
        todays_read: { needs_attention: [], top_performers: [], top_risers: [] },
      },
    });
    useTenantProductsInfiniteMock.mockImplementation((_period: unknown, filters: { brand?: string[] }) => {
      const alphaOnly = filters?.brand?.includes('Alpha');
      return {
        isLoading: false,
        isError: false,
        data: {
          pages: [
            {
              products: alphaOnly
                ? [{ id: 'p1', display_name: 'Alpha Water', brand_name: 'Alpha', on_hand: 10, days_cover: 30 }]
                : [
                    { id: 'p1', display_name: 'Alpha Water', brand_name: 'Alpha', on_hand: 10, days_cover: 30 },
                    { id: 'p2', display_name: 'Beta Juice', brand_name: 'Beta', on_hand: 5, days_cover: 12 },
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
              nextCursor: null,
              total: alphaOnly ? 1 : 2,
            },
          ],
        },
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      };
    });

    render(<ProductsLandingClient initialData={null} initialPeriod="month" />);

    expect(screen.getByText('2 SKUs across 2 brands. 0 out of stock, 0 running low — those are the ones to chase this week.')).toBeInTheDocument();
    expect(screen.getByText('Alpha Water')).toBeInTheDocument();
    expect(screen.getByText('Beta Juice')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Brand: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));

    expect(screen.getByText('2 SKUs across 2 brands. 0 out of stock, 0 running low — those are the ones to chase this week.')).toBeInTheDocument();
    expect(screen.getByText('Alpha Water')).toBeInTheDocument();
    expect(screen.queryByText('Beta Juice')).not.toBeInTheDocument();
  });
});
