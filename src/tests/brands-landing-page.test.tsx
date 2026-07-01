import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useTenantBrandsMock = vi.fn();
const useFlagMock = vi.fn();
const requireSellerServerTenantIdMock = vi.fn();
const resolveSellerLandingPeriodMock = vi.fn();
const fetchSellerPageBootstrapMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useBrands', () => ({
  useTenantBrands: () => useTenantBrandsMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/lib/server/seller-server-claims', () => ({
  requireSellerServerTenantId: (...args: unknown[]) => requireSellerServerTenantIdMock(...args),
}));

vi.mock('@/lib/server/seller-period', () => ({
  resolveSellerLandingPeriod: (...args: unknown[]) => resolveSellerLandingPeriodMock(...args),
}));

vi.mock('@/lib/server/seller-page-bootstrap', () => ({
  fetchSellerPageBootstrap: (...args: unknown[]) => fetchSellerPageBootstrapMock(...args),
}));

vi.mock('@/components/seller/brands/AddBrandCommand', () => ({
  AddBrandCommand: () => null,
}));

vi.mock('@/components/seller/InviteUserDialog', () => ({
  InviteUserDialog: () => null,
}));

import BrandsPage from '../../app/(seller)/brands/page';

describe('brands landing integration', () => {
  beforeEach(() => {
    useTenantBrandsMock.mockReset();
    useFlagMock.mockReset();
    requireSellerServerTenantIdMock.mockReset();
    resolveSellerLandingPeriodMock.mockReset();
    fetchSellerPageBootstrapMock.mockReset();
    requireSellerServerTenantIdMock.mockResolvedValue('tenant-1');
    resolveSellerLandingPeriodMock.mockResolvedValue('month');
    fetchSellerPageBootstrapMock.mockResolvedValue({ data: null, status: 403 });
  });

  it('renders flag-off empty state and does not fetch data when disabled', async () => {
    useFlagMock.mockReturnValue(false);

    const element = await BrandsPage({ searchParams: Promise.resolve({}) });
    render(element);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useTenantBrandsMock).not.toHaveBeenCalled();
  });
});
