import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const brandsClientMock = vi.fn();
const cohortsClientMock = vi.fn();
const catalogsClientMock = vi.fn();
const priceListsClientMock = vi.fn();
const getFlagMock = vi.fn();
const requireSellerServerTenantIdMock = vi.fn();
const resolveSellerLandingPeriodMock = vi.fn();
const fetchSellerPageBootstrapMock = vi.fn();

vi.mock('@/components/seller/brands/BrandsLandingClient', () => ({
  BrandsLandingClient: (props: unknown) => {
    brandsClientMock(props);
    return <div>brands-client</div>;
  },
}));

vi.mock('@/components/seller/cohorts/CohortsLandingClient', () => ({
  CohortsLandingClient: (props: unknown) => {
    cohortsClientMock(props);
    return <div>cohorts-client</div>;
  },
}));

vi.mock('@/components/seller/catalogs/CatalogsLandingClient', () => ({
  CatalogsLandingClient: (props: unknown) => {
    catalogsClientMock(props);
    return <div>catalogs-client</div>;
  },
}));

vi.mock('@/components/seller/price-lists/PriceListsLandingClient', () => ({
  PriceListsLandingClient: (props: unknown) => {
    priceListsClientMock(props);
    return <div>price-lists-client</div>;
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

import BrandsPage from '../../app/(seller)/brands/page';
import CustomerGroupsPage from '../../app/(seller)/customer-groups/page';
import CampaignsPage from '../../app/(seller)/campaigns/page';
import PriceListsPage from '../../app/(seller)/price-lists/page';

describe('seller landing pages forward URL search to landing clients', () => {
  beforeEach(() => {
    brandsClientMock.mockReset();
    cohortsClientMock.mockReset();
    catalogsClientMock.mockReset();
    priceListsClientMock.mockReset();
    getFlagMock.mockReset();
    requireSellerServerTenantIdMock.mockReset();
    resolveSellerLandingPeriodMock.mockReset();
    fetchSellerPageBootstrapMock.mockReset();

    getFlagMock.mockResolvedValue(true);
    requireSellerServerTenantIdMock.mockResolvedValue('tenant-1');
    resolveSellerLandingPeriodMock.mockResolvedValue('month');
    fetchSellerPageBootstrapMock.mockReturnValue({ data: { ok: true }, status: 200 });
  });

  it('passes search to the brands landing client', async () => {
    const element = await BrandsPage({ searchParams: Promise.resolve({ search: 'alpha' }) });
    render(element);

    expect(screen.getByText('brands-client')).toBeInTheDocument();
    expect(brandsClientMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ initialSearch: 'alpha', initialPeriod: 'last90' }));
  });

  it('passes search to the customer groups landing alias', async () => {
    const element = await CustomerGroupsPage({ searchParams: Promise.resolve({ search: 'north' }) });
    render(element);

    expect(screen.getByText('cohorts-client')).toBeInTheDocument();
    expect(cohortsClientMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ initialSearch: 'north', initialPeriod: 'last90' }));
  });

  it('passes search to the campaigns landing alias', async () => {
    const element = await CampaignsPage({ searchParams: Promise.resolve({ search: 'monsoon' }) });
    render(element);

    expect(screen.getByText('catalogs-client')).toBeInTheDocument();
    expect(catalogsClientMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ initialSearch: 'monsoon', initialPeriod: 'last90' }));
  });

  it('passes search to the price lists landing page', async () => {
    const element = await PriceListsPage({ searchParams: Promise.resolve({ search: 'north' }) });
    render(element);

    expect(screen.getByText('price-lists-client')).toBeInTheDocument();
    expect(priceListsClientMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ initialSearch: 'north' }));
  });
});
