import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const catalogsClientMock = vi.fn();
const getFlagMock = vi.fn();
const requireSellerServerTenantIdMock = vi.fn();
const resolveSellerLandingPeriodMock = vi.fn();
const fetchSellerPageBootstrapMock = vi.fn();

vi.mock('@/components/seller/catalogs/CatalogsLandingClient', () => ({
  CatalogsLandingClient: (props: unknown) => {
    catalogsClientMock(props);
    return <div>catalogs-client</div>;
  },
}));

vi.mock('@/lib/flags', () => ({
  FLAGS: { BRAND_PRODUCT_MASTER: 'brand_product_master' },
  getFlag: (...args: unknown[]) => getFlagMock(...args),
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

// SellerBootstrapBoundary wraps an async Server Component in <Suspense> — plain
// ReactDOM (what RTL renders with here) can't execute async components at all,
// only Next's RSC pipeline can. Mock it as a synchronous passthrough so these
// tests keep exercising the page → render prop wiring without needing an RSC
// runtime. fetchSellerPageBootstrapMock is set up with mockReturnValue (not
// mockResolvedValue) below so its result is available synchronously here.
vi.mock('@/components/seller/layout/SellerBootstrapBoundary', () => ({
  SellerBootstrapBoundary: ({ path, render }: { path: string; render: (data: unknown, status: number) => unknown }) => {
    const { data, status } = fetchSellerPageBootstrapMock(path);
    return render(data, status);
  },
}));

import CampaignsPage from '../../app/(seller)/campaigns/page';

// Brands, Customer Groups, and Price Lists moved their list rendering (and
// `?search=` forwarding) into layout.tsx as part of the split-pane rollout —
// their page.tsx is now a no-op, so those cases no longer apply here. Search
// seeding for those three is covered client-side (useSearchParams inside the
// landing client) rather than through this server-prop path. Campaigns is
// unaffected and still goes through page.tsx.
describe('seller landing pages forward URL search to landing clients', () => {
  beforeEach(() => {
    catalogsClientMock.mockReset();
    getFlagMock.mockReset();
    requireSellerServerTenantIdMock.mockReset();
    resolveSellerLandingPeriodMock.mockReset();
    fetchSellerPageBootstrapMock.mockReset();

    getFlagMock.mockResolvedValue(true);
    requireSellerServerTenantIdMock.mockResolvedValue('tenant-1');
    resolveSellerLandingPeriodMock.mockResolvedValue('month');
    fetchSellerPageBootstrapMock.mockReturnValue({ data: { ok: true }, status: 200 });
  });

  it('passes search to the campaigns landing alias', async () => {
    const element = await CampaignsPage({ searchParams: Promise.resolve({ search: 'monsoon' }) });
    render(element);

    expect(screen.getByText('catalogs-client')).toBeInTheDocument();
    expect(catalogsClientMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ initialSearch: 'monsoon', initialPeriod: 'last90' }));
  });
});
