import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useCohortDetailMock = vi.fn();
const useUpdateCohortDetailMock = vi.fn();

vi.mock('@/hooks/useCohorts', () => ({
  useCohortDetail: () => useCohortDetailMock(),
  useUpdateCohortDetail: () => useUpdateCohortDetailMock(),
}));

import { CohortDetailPage } from '@/components/seller/cohorts/detail/CohortDetailPage';

describe('cohort detail page integration', () => {
  beforeEach(() => {
    useCohortDetailMock.mockReset();
    useUpdateCohortDetailMock.mockReset();
    useUpdateCohortDetailMock.mockReturnValue({ isPending: false, mutate: vi.fn() });
  });

  it('shows 3 tabs only and renders backend conversion values', () => {
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
            members_text: '12 of 48 buyers',
            description_text: 'Description',
            created_by_text: 'Created by user 1234',
          },
        },
        meta_strip_4: {
          gmv_mtd: 50000,
          growth_pct: 10,
          active_members: 12,
          total_members: 18,
          aov: 2500,
          conversion_pct: 30,
        },
        details_rules: {
          id: 'c1',
          name: 'Maharashtra Premium',
          description: 'Description',
          type: 'Rule-based',
          is_static: false,
          rules: { filters: [] },
          members_preview: [],
          updated_at: new Date().toISOString(),
        },
        performance: {
          summary: {
            gmv_mtd: 50000,
            growth_pct: 10,
            aov: 2500,
          },
          engagement: {
            active_members: 12,
            total_members: 18,
            dormant_members: 6,
            conversion_pct: 30,
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
    expect(screen.getByText('30.0%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open buyer app preview' })).toBeInTheDocument();
  });
});
