import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantCatalogsMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/campaigns',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useTenantCatalogs: () => useTenantCatalogsMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

import { CatalogsLandingClient } from '@/components/seller/catalogs/CatalogsLandingClient';

describe('catalogs landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useTenantCatalogsMock.mockReset();
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
  });

  it('shows backend live catalog KPI', () => {
    useTenantCatalogsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kpis: {
          live_catalogs: 3,
          draft_catalogs: 1,
          ended_catalogs: 2,
          gmv_mtd: 120000,
          gmv_prev_mtd: 100000,
          gmv_growth_pct: 20,
          avg_conversion_pct: 4.2,
          orders_attributed_mtd: 14,
        },
        todays_read: { needs_attention: [], top_performers: [], top_risers: [] },
        catalogs: [],
      },
    });

    render(<CatalogsLandingClient initialData={null} initialPeriod="month" />);

    expect(screen.getByText('Live campaigns')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('filters campaigns by status dropdown options', () => {
    useTenantCatalogsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kpis: {
          live_catalogs: 1,
          draft_catalogs: 1,
          ended_catalogs: 0,
          gmv_mtd: 10000,
          gmv_prev_mtd: 8000,
          gmv_growth_pct: 25,
          avg_conversion_pct: 2.1,
          orders_attributed_mtd: 4,
        },
        todays_read: { needs_attention: [], top_performers: [], top_risers: [] },
        catalogs: [
          {
            id: 'live-1',
            name: 'Live Campaign',
            initials: 'LC',
            hue: 'teal',
            status: { value: 'published', label: 'Live', tone: 'success' },
            cohort_name: 'Tier A',
            products_count: 10,
            brands_count: 2,
            gmv: 12000,
            orders: 5,
            views: 0,
            conversion_pct: 0,
            valid_from: '2026-05-01T00:00:00Z',
            valid_to: '2026-06-10T00:00:00Z',
            valid_until_label: '10 Jun',
            days_left: 10,
            created_at: '2026-05-20T00:00:00Z',
            growth_pct: 20,
          },
          {
            id: 'draft-1',
            name: 'Draft Campaign',
            initials: 'DC',
            hue: 'ember',
            status: { value: 'draft', label: 'Draft', tone: 'warning' },
            cohort_name: 'Tier B',
            products_count: 4,
            brands_count: 1,
            gmv: 0,
            orders: 0,
            views: 0,
            conversion_pct: 0,
            valid_from: '2026-05-03T00:00:00Z',
            valid_to: '2026-06-03T00:00:00Z',
            valid_until_label: '03 Jun',
            days_left: 3,
            created_at: '2026-05-22T00:00:00Z',
            growth_pct: 0,
          },
        ],
      },
    });

    render(<CatalogsLandingClient initialData={null} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Status: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));

    expect(screen.getByText('Draft Campaign')).toBeInTheDocument();
    expect(screen.queryByText('Live Campaign')).not.toBeInTheDocument();
  });

  it('renders expiring soon row in Needs attention callout', () => {
    const expiring = {
      id: 'cat-live',
      name: 'Weekend Push',
      initials: 'WP',
      hue: 'ember',
      status: { value: 'published', label: 'Live', tone: 'success' },
      cohort_name: 'Tier A',
      products_count: 6,
      brands_count: 2,
      gmv: 5000,
      orders: 3,
      views: 0,
      conversion_pct: 0,
      valid_from: '2026-05-01T00:00:00Z',
      valid_to: '2026-05-31T00:00:00Z',
      valid_until_label: '31 May',
      days_left: 3,
      created_at: '2026-05-20T00:00:00Z',
      growth_pct: 10,
    };

    useTenantCatalogsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kpis: {
          live_catalogs: 1,
          draft_catalogs: 0,
          ended_catalogs: 0,
          gmv_mtd: 5000,
          gmv_prev_mtd: 4000,
          gmv_growth_pct: 25,
          avg_conversion_pct: 0,
          orders_attributed_mtd: 3,
        },
        todays_read: { needs_attention: [expiring], top_performers: [], top_risers: [] },
        catalogs: [expiring],
      },
    });

    render(<CatalogsLandingClient initialData={null} initialPeriod="month" />);

    expect(screen.getByText(/Expires in 3d/i)).toBeInTheDocument();
  });

});
