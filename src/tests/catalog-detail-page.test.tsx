import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useTenantCatalogDetailMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@/components/FeatureGate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useTenantCatalogDetail: (...args: unknown[]) => useTenantCatalogDetailMock(...args),
  usePublishCatalog: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEnsureCatalogShareLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddCatalogProduct: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveCatalogProduct: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ isSellerAdmin: true }),
}));

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useRouter: () => ({ push: pushMock }),
    usePathname: () => '/catalogs/cat-1',
  };
});

import { CatalogDetailPage } from '@/components/seller/catalogs/detail';

describe('catalog-detail-page integration', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
    useTenantCatalogDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        header: {
          id: 'cat-1',
          name: 'Summer Pours',
          status_label: 'Live',
          status_tone: 'success',
          initials: 'SP',
          products_count: 10,
          brands_covered: 3,
          cohort_name: 'Tier A',
          valid_from_label: '01 May 2026',
          valid_until_label: '30 Jun 2026',
          valid_until_iso: '2026-06-30T00:00:00.000Z',
          published_by: 'User 1234abcd',
          share_token: 'abc',
          share_url: 'https://example.com/buy/abc',
          scope_type: 'cohort',
          status_value: 'published',
          selected_cohort: {
            id: 'cohort-1',
            name: 'Tier A',
            member_count: 180,
            scope_type: 'cohort',
            display_label: 'Tier A',
          },
        },
        meta_strip_4: {
          gmv: 100000,
          growth_pct: 10,
          orders: 15,
          conversion_rate: 12,
          unique_viewers: 120,
          cohort_members: 180,
          days_left: 7,
          valid_until_label: '30 Jun 2026',
        },
        composition: [],
        products_summary: {
          filters: {
            brand_names: [],
            category_names: [],
            availability: 'show_everything',
          },
          included_count: 0,
          brands_covered: 0,
          in_stock_count: 0,
          tag_overrides_count: 0,
        },
        products: [],
        performance: {
          summary: {
            orders: 15,
            gmv: 100000,
            growth_pct: 10,
            aov: 6666,
            views: 184,
            unique_viewers: 120,
            conversion_rate: 12,
            abandoners: 3,
            valid_until_label: '30 Jun 2026',
            published_at_label: '01 May 2026',
          },
          funnel: { unique_viewers: 120, conversions: 15, orders: 12, estimates: 3, gmv: 100000 },
          daily: [{ date: '2026-05-10', revenue: 10000, conversion_rate: 5 }],
          cumulative_orders: [{ date: '2026-05-10', orders_cumulative: 15, gmv_cumulative: 100000 }],
          top_skus: [],
          per_buyer_activity: [],
        },
        buyers: [],
        permissions: { can_extend_validity: true, can_edit_composition: false },
      },
    });
    pushMock.mockReset();
  });

  it('loads performance tab by default and keeps activity tab absent', () => {
    render(<CatalogDetailPage id="cat-1" />);

    expect(screen.getByRole('button', { name: /Performance/i })).toHaveClass('border-teal-500');
    expect(screen.queryByRole('button', { name: /Activity/i })).not.toBeInTheDocument();
  });

  it('renders the published buyer-app action as a new-tab preview launch link', () => {
    render(<CatalogDetailPage id="cat-1" />);

    const buyerAppLink = screen.getByRole('link', { name: /View in Buyer App/i });
    expect(buyerAppLink).toHaveAttribute('href', '/api/buyer/preview/launch?share_token=abc');
    expect(buyerAppLink).toHaveAttribute('target', '_blank');
  });
});
