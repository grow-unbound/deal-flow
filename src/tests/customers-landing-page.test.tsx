import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useCustomersLandingMock = vi.fn();
const useFlagMock = vi.fn();
const requireSellerServerTenantIdMock = vi.fn();
const fetchSellerPageBootstrapMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
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

vi.mock('@/lib/server/seller-page-bootstrap', () => ({
  fetchSellerPageBootstrap: (...args: unknown[]) => fetchSellerPageBootstrapMock(...args),
}));

// See seller-search-param-pages.test.tsx for why this needs mocking: plain
// ReactDOM can't execute the async Server Component SellerBootstrapBoundary
// wraps in <Suspense>.
vi.mock('@/components/seller/layout/SellerBootstrapBoundary', () => ({
  SellerBootstrapBoundary: ({ path, render }: { path: string; render: (data: unknown, status: number) => unknown }) => {
    const { data, status } = fetchSellerPageBootstrapMock(path);
    return render(data, status);
  },
}));

// List rendering moved from page.tsx into layout.tsx as part of the split-pane
// rollout (the list now stays mounted across /customers <-> /customers/[id]).
import CustomersLayout from '../../app/(seller)/customers/layout';

describe('customers landing integration', () => {
  beforeEach(() => {
    useCustomersLandingMock.mockReset();
    useFlagMock.mockReset();
    requireSellerServerTenantIdMock.mockReset();
    fetchSellerPageBootstrapMock.mockReset();
    requireSellerServerTenantIdMock.mockResolvedValue('tenant-1');
    fetchSellerPageBootstrapMock.mockReturnValue({ data: null, status: 200 });
  });

  it('renders flag-off state and does not fetch landing data', () => {
    useFlagMock.mockReturnValue(false);

    return CustomersLayout({ children: null }).then((element) => {
      render(element);

      expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
      expect(useCustomersLandingMock).not.toHaveBeenCalled();
    });
  });
});
