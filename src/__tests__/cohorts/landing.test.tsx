import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useCohortsLandingMock = vi.fn();
const useCohortsLandingMetricsMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/customer-groups',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useCohorts', () => ({
  useCohortsLanding: () => useCohortsLandingMock(),
  useCohortsLandingMetrics: () => useCohortsLandingMetricsMock(),
  useSaveSimpleCustomerGroup: () => ({ mutate: vi.fn(), isPending: false }),
  useCohortComposerBuyers: () => ({
    data: { pages: [{ buyers: [], total: 0, nextCursor: null }] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock('@/hooks/useBrands', () => ({
  useTenantBrands: () => ({ data: { brands: [] } }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

import { CohortsLandingClient } from '@/components/seller/cohorts/CohortsLandingClient';

describe('cohorts landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useCohortsLandingMock.mockReset();
    useCohortsLandingMetricsMock.mockReset();
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
    useCohortsLandingMetricsMock.mockReturnValue({
      data: {
        page_key: 'customer_groups',
        period: { period_key: 'this_quarter', grain: 'quarter', period_start: '', period_end_exclusive: '' },
        computed_at: null,
        source_watermark: null,
        cards: [
          { id: 'customers-assigned', label: 'Customers assigned to a Group', value: 8, supporting_text: '80% of 10 customers' },
          { id: 'valuable-uncategorised', label: 'Valuable customers in no Group', value: 2, supporting_text: 'This quarter' },
          { id: 'grouped-purchase-rate', label: 'Grouped customers who purchased', value: 17.4, supporting_text: 'Average purchase rate across groups' },
        ],
      },
    });
  });

  it('renders uncategorised buyers count from backend KPI', () => {
    useCohortsLandingMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kpis: {
          total_cohorts: 2,
          covered_members: 8,
          total_buyers: 10,
          combined_gmv_mtd: 250000,
          growth_pct: 12,
          avg_conversion_pct: 17.4,
          uncategorised_buyers: 2,
        },
        todays_read: { low_conversion: [], top_performers: [], top_risers: [] },
        cohorts: [],
      },
    });

    render(<CohortsLandingClient initialData={null} />);

    expect(screen.getByText('Valuable customers in no Group')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('cohort tile click navigates to /customer-groups/{id}', () => {
    useCohortsLandingMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kpis: {
          total_cohorts: 1,
          covered_members: 4,
          total_buyers: 5,
          combined_gmv_mtd: 100000,
          growth_pct: 10,
          avg_conversion_pct: 16.1,
          uncategorised_buyers: 1,
        },
        todays_read: { low_conversion: [], top_performers: [], top_risers: [] },
        cohorts: [
          {
            id: 'coh-1',
            name: 'South Tier-A',
            description: 'South + Tier A accounts',
            type: 'Geo-based',
            focus_chips: ['Karnataka'],
            gmv_mtd: 100000,
            growth_pct: 11,
            active_members: 3,
            total_members: 4,
            conversion_pct: 19.7,
            live_catalogs_count: 1,
            status_label: 'Active',
            status_tone: 'success',
          },
        ],
        brands: [{ id: 'brand-1', name: 'Brand One' }],
      },
    });

    render(<CohortsLandingClient initialData={null} />);
    fireEvent.click(screen.getAllByText('South Tier-A')[1]!);

    expect(pushMock).toHaveBeenCalledWith('/customer-groups/coh-1');
  });

  it('avg conversion is rendered with one decimal place', () => {
    useCohortsLandingMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kpis: {
          total_cohorts: 1,
          covered_members: 3,
          total_buyers: 4,
          combined_gmv_mtd: 120000,
          growth_pct: 9,
          avg_conversion_pct: 12,
          uncategorised_buyers: 1,
        },
        todays_read: { low_conversion: [], top_performers: [], top_risers: [] },
        cohorts: [],
        brands: [{ id: 'brand-1', name: 'Brand One' }],
      },
    });

    render(<CohortsLandingClient initialData={null} />);
    expect(screen.getByText('17.4%')).toBeInTheDocument();
  });

  it('filters customer groups by selected brand', () => {
    useCohortsLandingMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kpis: {
          total_cohorts: 2,
          covered_members: 8,
          total_buyers: 10,
          combined_gmv_mtd: 250000,
          growth_pct: 12,
          avg_conversion_pct: 17.4,
          uncategorised_buyers: 2,
        },
        todays_read: { low_conversion: [], top_performers: [], top_risers: [] },
        brands: [
          { id: 'brand-1', name: 'Brand One' },
          { id: 'brand-2', name: 'Brand Two' },
        ],
        cohorts: [
          {
            id: 'coh-1',
            name: 'Brand One Cohort',
            description: null,
            type: 'Brand affinity',
            focus_chips: ['Brand One'],
            allowed_tenant_brand_ids: ['brand-1'],
            gmv_mtd: 100000,
            growth_pct: 11,
            active_members: 3,
            total_members: 4,
            conversion_pct: 19.7,
            live_catalogs_count: 1,
            status_label: 'Active',
            status_tone: 'success',
          },
          {
            id: 'coh-2',
            name: 'Brand Two Cohort',
            description: null,
            type: 'Brand affinity',
            focus_chips: ['Brand Two'],
            allowed_tenant_brand_ids: ['brand-2'],
            gmv_mtd: 50000,
            growth_pct: 3,
            active_members: 2,
            total_members: 4,
            conversion_pct: 9.7,
            live_catalogs_count: 1,
            status_label: 'Active',
            status_tone: 'success',
          },
        ],
      },
    });

    render(<CohortsLandingClient initialData={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Brands: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Brand One' }));

    expect(screen.getAllByText('Brand One Cohort').length).toBeGreaterThan(0);
    expect(screen.queryByText('Brand Two Cohort')).not.toBeInTheDocument();
  });
});
