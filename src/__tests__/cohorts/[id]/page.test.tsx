import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useCohortDetailMock = vi.fn();
const useUpdateCohortDetailMock = vi.fn();

vi.mock('@/hooks/useCohorts', () => ({
  useCohortDetail: () => useCohortDetailMock(),
  useUpdateCohortDetail: () => useUpdateCohortDetailMock(),
}));

import { CohortDetailPage } from '@/components/seller/cohorts/detail/CohortDetailPage';

describe('cohort detail page', () => {
  beforeEach(() => {
    useCohortDetailMock.mockReset();
    useUpdateCohortDetailMock.mockReset();
    useUpdateCohortDetailMock.mockReturnValue({ isPending: false, mutate: vi.fn() });
  });

  it('renders exactly three tabs and no members/catalogs tabs', () => {
    useCohortDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        header: {
          id: 'c1',
          cohort_name: 'Maharashtra Premium',
          status_label: 'Dynamic',
          status_tone: 'success',
          initials: 'MP',
          hue: 'ember',
          subtitle: {
            members_text: '20 of 100 buyers',
            description_text: 'Premium buyers in Maharashtra',
            created_by_text: 'Created by user 1234',
          },
        },
        meta_strip_4: {
          gmv_mtd: 120000,
          growth_pct: 12.5,
          active_members: 10,
          total_members: 20,
          aov: 5000,
          conversion_pct: 25,
        },
        details_rules: {
          id: 'c1',
          name: 'Maharashtra Premium',
          description: 'Premium buyers in Maharashtra',
          type: 'Rule-based',
          is_static: false,
          rules: { filters: [] },
          members_preview: [],
          updated_at: new Date().toISOString(),
        },
        performance: {
          summary: {
            gmv_mtd: 120000,
            growth_pct: 12.5,
            aov: 5000,
          },
          engagement: {
            active_members: 10,
            total_members: 20,
            dormant_members: 10,
            conversion_pct: 25,
            brands_sold: 3,
            brands_carried: 5,
          },
          top_members: [],
          catalogs: [],
          gmv_trend_12m: [],
        },
        activity: [],
      },
    });

    render(<CohortDetailPage id="c1" />);

    expect(screen.getByRole('button', { name: 'Details & rules' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Performance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Members/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Catalogs/i })).not.toBeInTheDocument();
  });

  it('renders exactly 4 meta strip tiles and keeps members count in subtitle', () => {
    useCohortDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        header: {
          id: 'c1',
          cohort_name: 'Maharashtra Premium',
          status_label: 'Dynamic',
          status_tone: 'success',
          initials: 'MP',
          hue: 'ember',
          subtitle: {
            members_text: '20 of 100 buyers',
            description_text: 'Premium buyers in Maharashtra',
            created_by_text: 'Created by user 1234',
          },
        },
        meta_strip_4: {
          gmv_mtd: 120000,
          growth_pct: 12.5,
          active_members: 10,
          total_members: 20,
          aov: 5000,
          conversion_pct: 25,
        },
        details_rules: {
          id: 'c1',
          name: 'Maharashtra Premium',
          description: 'Premium buyers in Maharashtra',
          type: 'Rule-based',
          is_static: false,
          rules: { filters: [] },
          members_preview: [],
          updated_at: new Date().toISOString(),
        },
        performance: {
          summary: {
            gmv_mtd: 120000,
            growth_pct: 12.5,
            aov: 5000,
          },
          engagement: {
            active_members: 10,
            total_members: 20,
            dormant_members: 10,
            conversion_pct: 25,
            brands_sold: 3,
            brands_carried: 5,
          },
          top_members: [],
          catalogs: [],
          gmv_trend_12m: [],
        },
        activity: [],
      },
    });

    render(<CohortDetailPage id="c1" />);

    expect(screen.getByText('GMV · MTD')).toBeInTheDocument();
    expect(screen.getByText('Active members')).toBeInTheDocument();
    expect(screen.getByText('AOV')).toBeInTheDocument();
    expect(screen.getByText('Conversion')).toBeInTheDocument();
    expect(screen.queryByText(/^Members$/i)).not.toBeInTheDocument();
    expect(screen.getByText('20 of 100 buyers')).toBeInTheDocument();
  });

  it('renders v2 performance sections', () => {
    useCohortDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        header: {
          id: 'c1',
          cohort_name: 'Maharashtra Premium',
          status_label: 'Dynamic',
          status_tone: 'success',
          initials: 'MP',
          hue: 'ember',
          subtitle: {
            members_text: '20 of 100 buyers',
            description_text: 'Premium buyers in Maharashtra',
            created_by_text: 'Created by user 1234',
          },
        },
        meta_strip_4: {
          gmv_mtd: 120000,
          growth_pct: 12.5,
          active_members: 10,
          total_members: 20,
          aov: 5000,
          conversion_pct: 25,
        },
        details_rules: {
          id: 'c1',
          name: 'Maharashtra Premium',
          description: 'Premium buyers in Maharashtra',
          type: 'Rule-based',
          is_static: false,
          rules: { filters: [] },
          members_preview: [],
          updated_at: new Date().toISOString(),
        },
        performance: {
          summary: {
            gmv_mtd: 120000,
            growth_pct: 12.5,
            aov: 5000,
          },
          engagement: {
            active_members: 10,
            total_members: 20,
            dormant_members: 10,
            conversion_pct: 25,
            brands_sold: 3,
            brands_carried: 5,
          },
          top_members: [],
          catalogs: [],
          gmv_trend_12m: [],
        },
        activity: [],
      },
    });

    render(<CohortDetailPage id="c1" />);

    expect(screen.getByText('GMV trend')).toBeInTheDocument();
    expect(screen.getByText('Engagement')).toBeInTheDocument();
    expect(screen.getByText('Top members')).toBeInTheDocument();
    expect(screen.getByText('Catalogs to this cohort')).toBeInTheDocument();
  });
});
