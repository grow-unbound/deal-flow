import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useTenantBrandsMock = vi.fn();
const useFlagMock = vi.fn();
const requireSellerServerTenantIdMock = vi.fn();
const resolveSellerLandingPeriodMock = vi.fn();
const fetchSellerPageBootstrapMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
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

// See seller-search-param-pages.test.tsx for why this needs mocking: plain
// ReactDOM can't execute the async Server Component SellerBootstrapBoundary
// wraps in <Suspense>.
vi.mock('@/components/seller/layout/SellerBootstrapBoundary', () => ({
  SellerBootstrapBoundary: ({ path, render }: { path: string; render: (data: unknown, status: number) => unknown }) => {
    const { data, status } = fetchSellerPageBootstrapMock(path);
    return render(data, status);
  },
}));

vi.mock('@/components/seller/brands/AddBrandCommand', () => ({
  AddBrandCommand: () => null,
}));

vi.mock('@/components/seller/InviteUserDialog', () => ({
  InviteUserDialog: () => null,
}));

// Flag-gate + list rendering moved from page.tsx into layout.tsx as part of the
// split-pane rollout (the list now stays mounted across /brands <-> /brands/[id]),
// so this exercises BrandsLayout instead of the (now trivial) BrandsPage.
import BrandsLayout from '../../app/(seller)/brands/layout';

describe('brands landing integration', () => {
  beforeEach(() => {
    useTenantBrandsMock.mockReset();
    useFlagMock.mockReset();
    requireSellerServerTenantIdMock.mockReset();
    resolveSellerLandingPeriodMock.mockReset();
    fetchSellerPageBootstrapMock.mockReset();
    requireSellerServerTenantIdMock.mockResolvedValue('tenant-1');
    resolveSellerLandingPeriodMock.mockResolvedValue('month');
    fetchSellerPageBootstrapMock.mockReturnValue({ data: null, status: 403 });
  });

  it('renders flag-off empty state and does not fetch data when disabled', async () => {
    useFlagMock.mockReturnValue(false);

    const element = await BrandsLayout({ children: null });
    render(element);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useTenantBrandsMock).not.toHaveBeenCalled();
  });
});
