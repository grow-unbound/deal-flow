import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useCustomersLandingMock = vi.fn();
const useFlagMock = vi.fn();
const requireSellerServerTenantIdMock = vi.fn();
const resolveSellerLandingPeriodMock = vi.fn();
const fetchSellerPageBootstrapMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useCustomersLanding', () => ({
  useCustomersLanding: () => useCustomersLandingMock(),
  useCreateCustomerOptimistic: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/components/seller/customers/CustomersLandingClient', () => ({
  CustomersLandingClient: () => <div>This feature isn't enabled yet.</div>,
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

import CustomersPage from '../../app/(seller)/customers/page';

describe('customers landing integration', () => {
  beforeEach(() => {
    useCustomersLandingMock.mockReset();
    useFlagMock.mockReset();
    requireSellerServerTenantIdMock.mockReset();
    resolveSellerLandingPeriodMock.mockReset();
    fetchSellerPageBootstrapMock.mockReset();
    requireSellerServerTenantIdMock.mockResolvedValue('tenant-1');
    resolveSellerLandingPeriodMock.mockResolvedValue('month');
    fetchSellerPageBootstrapMock.mockResolvedValue({ data: null, status: 200 });
  });

  it('renders flag-off state and does not fetch landing data', () => {
    useFlagMock.mockReturnValue(false);

    return CustomersPage({ searchParams: Promise.resolve({}) }).then((element) => {
      render(element);

      expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
      expect(useCustomersLandingMock).not.toHaveBeenCalled();
    });
  });
});
