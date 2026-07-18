import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useCohortDetailMock = vi.fn();

vi.mock('@/hooks/useCohorts', () => ({
  useCohortDetail: () => useCohortDetailMock(),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    role: 'seller_admin',
    isSellerAdmin: true,
    isSellerAssistant: false,
    isBuyerAdmin: false,
    isBuyerAssistant: false,
    isSeller: true,
    isBuyer: false,
    can: () => true,
  }),
}));

import { CohortDetailPage } from '@/components/seller/cohorts/detail/CohortDetailPage';

describe('cohort detail page integration', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useCohortDetailMock.mockReset();
  });

  it('shows 2 tabs and renders backend conversion values', () => {
    useCohortDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        header: {
          id: 'c1',
          cohort_name: 'Maharashtra Premium',
          status_label: 'Active',
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
        buyers: [],
        rules_summary: {
          is_static: false,
          member_count: 18,
          total_tenant_buyers: 48,
          matched_of_total_label: '18 of 48 buyers',
          filters: [],
        },
      },
    });

    render(<CohortDetailPage id="c1" />);

    expect(screen.getByRole('tab', { name: 'Buyers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Performance' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Activity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Members/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Catalogs/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('30.0%').length).toBeGreaterThanOrEqual(1);
    const editLink = screen.getByRole('link', { name: /Edit customer group/i });
    expect(editLink).toBeInTheDocument();
    expect(editLink).toHaveAttribute('href', '/customer-groups/c1/edit');
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open buyer app preview' })).not.toBeInTheDocument();
  });
});
