import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
    expect(screen.getByText('₹3,50,000')).toBeInTheDocument();
  });

  it('At risk filter hides brands without alerts', () => {
    useTenantBrandsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        categories: ['Smartphones'],
        brands: [
          { id: 'b1', display_name_override: 'Risky Brand', master_brand: { name: 'Risky Brand' }, alerts: ['low_stock_risk'], categories: ['Smartphones'] },
          { id: 'b2', display_name_override: 'Healthy Brand', master_brand: { name: 'Healthy Brand' }, alerts: [], categories: ['Smartphones'] },
        ],
      },
    });

    render(<BrandsLandingClient initialData={null} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'At risk' }));

    expect(screen.getByText('Risky Brand')).toBeInTheDocument();
    expect(screen.queryByText('Healthy Brand')).not.toBeInTheDocument();
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

    render(<BrandsLandingClient initialData={null} initialPeriod="month" />);
    fireEvent.click(screen.getByText('Alpha'));

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

    render(<BrandsLandingClient initialData={null} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Audio' }));
    expect(screen.getByText('AudioMax')).toBeInTheDocument();
    expect(screen.queryByText('WearX')).not.toBeInTheDocument();
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
