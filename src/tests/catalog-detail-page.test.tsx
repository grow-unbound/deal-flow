import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useTenantCatalogDetailMock = vi.fn();

vi.mock('@/components/FeatureGate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useTenantCatalogDetail: (...args: unknown[]) => useTenantCatalogDetailMock(...args),
  useExtendCatalogValidity: () => ({ mutate: vi.fn(), isPending: false }),
  useAddCatalogProduct: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveCatalogProduct: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ isSellerAdmin: true }),
}));

import { CatalogDetailPage } from '@/components/seller/catalogs/detail';

describe('catalog-detail-page integration', () => {
  beforeEach(() => {
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
          share_url: 'https://example.com/shop/abc',
          scope_type: 'cohort',
          status_value: 'published',
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
        performance: {
          funnel: { unique_viewers: 120, cart_additions: 50, orders: 15, gmv: 100000 },
          daily: [{ date: '2026-05-10', revenue: 10000, conversion_rate: 5 }],
        },
        buyers: [],
        permissions: { can_extend_validity: true, can_edit_composition: false },
      },
    });
  });

  it('loads performance tab by default and keeps activity tab absent', () => {
    render(<CatalogDetailPage id="cat-1" />);

    expect(screen.getByRole('button', { name: /Performance/i })).toHaveClass('border-teal-500');
    expect(screen.queryByRole('button', { name: /Activity/i })).not.toBeInTheDocument();
  });
});
