import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantBrandsMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/useBrands', () => ({
  useTenantBrands: () => useTenantBrandsMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/components/seller/brands/AddBrandCommand', () => ({
  AddBrandCommand: () => null,
}));

vi.mock('@/components/seller/InviteUserDialog', () => ({
  InviteUserDialog: () => null,
}));

import BrandsPage from '../../../app/(seller)/brands/page';

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
        brands: [
          { id: 'b1', display_name_override: 'Brand One', master_brand: { name: 'Brand One' }, gmv_mtd: 100000 },
          { id: 'b2', display_name_override: 'Brand Two', master_brand: { name: 'Brand Two' }, gmv_mtd: 250000 },
        ],
      },
    });

    render(<BrandsPage />);

    expect(screen.getByText('Portfolio GMV')).toBeInTheDocument();
    expect(screen.getByText('₹3,50,000')).toBeInTheDocument();
  });

  it('At risk filter hides brands without alerts', () => {
    useTenantBrandsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        brands: [
          { id: 'b1', display_name_override: 'Risky Brand', master_brand: { name: 'Risky Brand' }, alerts: ['low_stock_risk'] },
          { id: 'b2', display_name_override: 'Healthy Brand', master_brand: { name: 'Healthy Brand' }, alerts: [] },
        ],
      },
    });

    render(<BrandsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'At risk' }));

    expect(screen.getByText('Risky Brand')).toBeInTheDocument();
    expect(screen.queryByText('Healthy Brand')).not.toBeInTheDocument();
  });

  it('clicking a row navigates to /brands/{id}', () => {
    useTenantBrandsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        brands: [{ id: 'brand-123', display_name_override: 'Alpha', master_brand: { name: 'Alpha' } }],
      },
    });

    render(<BrandsPage />);
    fireEvent.click(screen.getByText('Alpha'));

    expect(pushMock).toHaveBeenCalledWith('/brands/brand-123');
  });
});
