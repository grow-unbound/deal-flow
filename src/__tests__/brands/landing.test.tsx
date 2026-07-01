import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantBrandsMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/brands',
}));

vi.mock('@/hooks/useBrands', () => ({
  useTenantBrands: () => useTenantBrandsMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/hooks/useSellerLandingPeriod', () => ({
  useSellerLandingPeriod: () => ({
    period: 'month' as const,
    setPeriod: vi.fn(),
    horizonLabel: 'This month',
    lowerLabel: 'this month',
    metricSuffix: 'MTD',
    options: [{ value: 'month' as const, label: 'This Month' }],
  }),
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
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
  });

  it('shows Portfolio GMV as sum of brand GMV values', () => {
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

    render(<BrandsLandingClient initialData={null} initialPeriod="month" />);

    expect(screen.getByText('Portfolio GMV')).toBeInTheDocument();
    expect(screen.getByText('₹3.50L')).toBeInTheDocument();
  });

  it('At risk filter hides brands without alerts', () => {
    useTenantBrandsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        categories: ['Audio', 'Wearables'],
        brands: [
          { id: 'b1', display_name_override: 'Risky Brand', master_brand: { name: 'Risky Brand' }, alerts: ['low_stock_risk'], categories: ['Audio'] },
          { id: 'b2', display_name_override: 'Healthy Brand', master_brand: { name: 'Healthy Brand' }, alerts: [], categories: ['Wearables'] },
        ],
      },
    });

    const { container } = render(<BrandsLandingClient initialData={null} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Categories: All' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Audio' }));

    const tbody = container.querySelector('table tbody');
    expect(tbody).toBeTruthy();
    expect(within(tbody as HTMLElement).getAllByText('Risky Brand').length).toBeGreaterThan(0);
    expect(within(tbody as HTMLElement).queryAllByText('Healthy Brand').length).toBe(0);
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

    const { container } = render(<BrandsLandingClient initialData={null} initialPeriod="month" />);
    const tbody = container.querySelector('table tbody');
    expect(tbody).toBeTruthy();
    fireEvent.click(within(tbody as HTMLElement).getByText('Alpha').closest('tr')!);

    expect(pushMock).toHaveBeenCalledWith('/brands/brand-123');
  });

  it('category filter shows only brands in selected category', () => {
    useTenantBrandsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        categories: ['Audio', 'Wearables'],
        brands: [
          { id: 'b1', display_name_override: 'AudioMax', master_brand: { name: 'AudioMax' }, categories: ['Audio'] },
          { id: 'b2', display_name_override: 'WearX', master_brand: { name: 'WearX' }, categories: ['Wearables'] },
        ],
      },
    });

    const { container } = render(<BrandsLandingClient initialData={null} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Categories: All' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Audio' }));
    const tbody = container.querySelector('table tbody');
    expect(tbody).toBeTruthy();
    expect(within(tbody as HTMLElement).getAllByText('AudioMax').length).toBeGreaterThan(0);
    expect(within(tbody as HTMLElement).queryAllByText('WearX').length).toBe(0);
  });

  it('shows active buyers ratio and catalog age from DB-backed fields', () => {
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
            active_buyers_mtd: 7,
            total_buyers: 11,
            sku_count: 5,
            catalog_days_ago: 4,
          },
        ],
      },
    });

    render(<BrandsLandingClient initialData={null} initialPeriod="month" />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('/ 11')).toBeInTheDocument();
    expect(screen.getByText('4d ago')).toBeInTheDocument();
  });
});
