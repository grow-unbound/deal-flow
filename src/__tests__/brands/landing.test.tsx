import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';

const pushMock = vi.fn();
const useTenantBrandsMock = vi.fn();
const useTenantBrandsMetricsMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/brands',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useBrands', () => ({
  useTenantBrands: (...args: unknown[]) => useTenantBrandsMock(...args),
  useTenantBrandsMetrics: (...args: unknown[]) => useTenantBrandsMetricsMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/components/FeatureGate', () => ({
  FeatureGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/seller/mobile', () => ({
  SellerMobileList: () => null,
  SplitPaneBootstrapFallback: () => <div data-testid="split-pane-bootstrap-fallback" />,
  SplitPaneListRowsSkeleton: () => <div data-testid="split-pane-list-skeleton" />,
  SplitPaneStickyHeaderSlot: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/seller/brands/AddBrandCommand', () => ({
  AddBrandCommand: () => null,
}));

vi.mock('@/components/seller/InviteUserDialog', () => ({
  InviteUserDialog: () => null,
}));

import { BrandsLandingClient } from '@/components/seller/brands/BrandsLandingClient';

describe('brands landing page', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key) keys.push(key);
      }
      keys.forEach((key) => window.localStorage.removeItem(key));
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const keys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (key) keys.push(key);
      }
      keys.forEach((key) => window.sessionStorage.removeItem(key));
    }
    pushMock.mockReset();
    useTenantBrandsMock.mockReset();
    useTenantBrandsMetricsMock.mockReset();
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
    useTenantBrandsMetricsMock.mockReturnValue({
      data: {
        cards: [
          { id: 'active_brands', label: 'Active brands', value: 2, supporting_text: 'of all brands', filter_preset: { sold_period: 'this_month' } },
          { id: 'top80_brands', label: 'Top 80% brands', value: 1, supporting_text: 'of 2 brands', filter_preset: { sort: 'invoice_value_desc', cutoff: 'top80' } },
          { id: 'did_not_sell', label: 'Brands that did not sell', value: 0, supporting_text: 'no selected-period sale', filter_preset: { not_sold_period: 'this_month' } },
          { id: 'dormant_brands', label: 'Dormant brands', value: 0, supporting_text: 'sold prior period not selected period', filter_preset: { sold_previous_period: true, sold_current_period: false } },
        ],
      },
    });
  });

  it('shows V4 brand KPI cards from the metrics snapshot', () => {
    useTenantBrandsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        categories: ['Smartphones'],
        kpis: {
          portfolio_gmv_mtd: 350000,
          portfolio_gmv_prev_mtd: 300000,
          brands_carried: 2,
          buyers_with_orders_mtd: 8,
          total_buyers: 10,
          need_attention_count: 1,
          catalog_freshness_count: 1,
          catalog_freshness_earliest_days: 3,
        },
        brands: [
          { id: 'b1', display_name_override: 'Brand One', master_brand: { name: 'Brand One' }, gmv_mtd: 100000, categories: ['Smartphones'] },
          { id: 'b2', display_name_override: 'Brand Two', master_brand: { name: 'Brand Two' }, gmv_mtd: 250000, categories: ['Smartphones'] },
        ],
      },
    });

    render(<BrandsLandingClient initialMetrics={null} />);

    expect(screen.getByText('Active brands')).toBeInTheDocument();
    expect(screen.getByText('Top 80% brands')).toBeInTheDocument();
  });

  it('clicking a KPI card passes its V4 filter preset to the table hook', () => {
    useTenantBrandsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        brands: [],
      },
    });

    render(<BrandsLandingClient initialMetrics={null} />);
    fireEvent.click(screen.getByText('Top 80% brands'));

    expect(useTenantBrandsMock).toHaveBeenLastCalledWith(
      'month',
      expect.objectContaining({ filter_preset: { sort: 'invoice_value_desc', cutoff: 'top80' } }),
    );
  });

  it('clicking a row navigates to /brands/{id}', () => {
    useTenantBrandsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        categories: ['Smartphones'],
        brands: [{ id: 'brand-123', display_name_override: 'Alpha', master_brand: { name: 'Alpha' }, categories: ['Smartphones'] }],
      },
    });

    const { container } = render(<BrandsLandingClient initialMetrics={null} />);
    const tbody = container.querySelector('table tbody');
    expect(tbody).toBeTruthy();
    fireEvent.click(within(tbody as HTMLElement).getByText('Alpha').closest('tr')!);

    expect(pushMock).toHaveBeenCalledWith('/brands/brand-123');
  });

  it('passes search to the server-side landing hook', () => {
    useTenantBrandsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        brands: [],
      },
    });

    render(<BrandsLandingClient initialMetrics={null} />);
    fireEvent.change(screen.getByPlaceholderText('Search brand…'), { target: { value: 'audio' } });

    expect(useTenantBrandsMock).toHaveBeenLastCalledWith(
      'month',
      expect.objectContaining({ search: 'audio' }),
    );
  });

  it('shows product, invoice, sold-product, and purchasing-customer fields', () => {
    useTenantBrandsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        categories: ['Audio'],
        brands: [
          {
            id: 'b1',
            display_name_override: 'AudioMax',
            master_brand: { name: 'AudioMax' },
            categories: ['Audio'],
            gmv_mtd: 100000,
            gmv_prev_mtd: 90000,
            sku_count: 5,
            invoice_count: 9,
            invoice_product_count: 4,
            invoice_buyer_count: 7,
          },
        ],
        portfolio_sales_value: 100000,
      },
    });

    render(<BrandsLandingClient initialMetrics={null} />);
    expect(screen.getByText('Product count')).toBeInTheDocument();
    expect(screen.getByText('Invoice count')).toBeInTheDocument();
    expect(screen.getByText('Sold products')).toBeInTheDocument();
    expect(screen.getByText('Purchasing customers')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
