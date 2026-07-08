import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const useTenantCatalogsMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useTenantCatalogs: () => useTenantCatalogsMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

import CatalogsPage from '../../app/(seller)/campaigns/page';

describe('catalogs landing integration', () => {
  beforeEach(() => {
    useTenantCatalogsMock.mockReset();
    useFlagMock.mockReset();
  });

  it('renders flag-off state and does not fetch data when disabled', () => {
    useFlagMock.mockReturnValue(false);

    render(<CatalogsPage />);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useTenantCatalogsMock).not.toHaveBeenCalled();
  });

  it('renders grid and supports filter/search/sort interactions', () => {
    useFlagMock.mockReturnValue(true);
    useTenantCatalogsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        channels: { orders_enabled: true, estimates_enabled: true },
        kpis: {
          live_catalogs: 1,
          draft_catalogs: 1,
          ended_catalogs: 1,
          gmv_mtd: 200000,
          gmv_prev_mtd: 100000,
          gmv_growth_pct: 100,
          avg_conversion_pct: 3.2,
          orders_attributed_mtd: 9,
        },
        todays_read: { needs_attention: [], top_performers: [], top_risers: [] },
        catalogs: [
          {
            id: 'live-1',
            name: 'Summer Pours',
            initials: 'SP',
            hue: 'teal',
            status: { value: 'published', label: 'Live', tone: 'success' },
            cohort_name: 'Tier A',
            audience_count: 18,
            products_count: 10,
            brands_count: 2,
            gmv: 120000,
            orders: 4,
            order_count: 4,
            estimate_count: 1,
            conversions: 5,
            views: 10,
            view_pct: 55.6,
            conversion_pct: 50,
            valid_from: '2026-05-01T00:00:00Z',
            valid_to: '2026-06-10T00:00:00Z',
            valid_until_label: '10 Jun',
            days_left: 10,
            created_at: '2026-05-20T00:00:00Z',
            growth_pct: 20,
          },
          {
            id: 'draft-1',
            name: 'Draft Picks',
            initials: 'DP',
            hue: 'ember',
            status: { value: 'draft', label: 'Draft', tone: 'warning' },
            cohort_name: 'Tier B',
            audience_count: 6,
            products_count: 4,
            brands_count: 1,
            gmv: 0,
            orders: 0,
            order_count: 0,
            estimate_count: 0,
            conversions: 0,
            views: 0,
            view_pct: 0,
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

    render(<CatalogsPage />);

    expect(screen.getByText('Summer Pours')).toBeInTheDocument();
    expect(screen.getByText('Draft Picks')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    expect(screen.queryByText('Summer Pours')).not.toBeInTheDocument();
    expect(screen.getByText('Draft Picks')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search catalog or cohort…'), { target: { value: 'summer' } });
    expect(screen.getByText('Summer Pours')).toBeInTheDocument();
    expect(screen.queryByText('Draft Picks')).not.toBeInTheDocument();
  });
});
