import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantProductsMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/useProducts', () => ({
  useTenantProducts: () => useTenantProductsMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/components/seller/products/AddProductSheet', () => ({
  AddProductSheet: () => null,
}));

import ProductsPage from '../../../app/(seller)/products/page';

describe('products landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useTenantProductsMock.mockReset();
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
  });

  it('shows backend out-of-stock KPI count', () => {
    useTenantProductsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kpis: {
          active_skus: 10,
          total_skus: 14,
          archived_skus: 4,
          out_of_stock: 3,
          low_stock: 2,
          revenue_mtd: 100000,
          revenue_prev_mtd: 90000,
          revenue_growth_pct: 11,
        },
        brands: ['Red wine'],
        products: [],
      },
    });

    render(<ProductsPage />);

    expect(screen.getByText('Out of stock')).toBeInTheDocument();
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
      },
    });

    render(<ProductsPage />);

    expect(screen.getByText('0d')).toHaveClass('text-danger-700');
    expect(screen.getByText('5d')).toHaveClass('text-warning-700');
    expect(screen.getByText('20d')).not.toHaveClass('text-warning-700');
  });

  it('Low stock chip filters products with days_cover < 14 and on_hand > 0', () => {
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
      },
    });

    render(<ProductsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Low stock' }));

    expect(screen.getByText('Low but available')).toBeInTheDocument();
    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument();
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument();
  });

  it('clicking a product row navigates to /products/{id}', () => {
    useTenantProductsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        brands: ['Red wine'],
        products: [
          { id: 'product-123', display_name: 'Merlot Reserve', internal_sku: 'M-123', master_product: { master_sku: 'M-123' }, brand_name: 'Red wine', category_name: 'Wine', on_hand: 10, days_cover: 16, units_mtd: 8, gmv_mtd: 5000, growth_pct: 9, status_tone: 'success', status_label: 'On pace' },
        ],
      },
    });

    render(<ProductsPage />);

    fireEvent.click(screen.getByText('Merlot Reserve'));

    expect(pushMock).toHaveBeenCalledWith('/products/product-123');
  });
});
