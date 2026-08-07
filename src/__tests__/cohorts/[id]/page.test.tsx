import type { ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render as rtlRender, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Page renders components that call useQueryClient()/useQuery() for real — needs a provider.
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const useCohortDetailMock = vi.fn();

vi.mock('@/hooks/useCohorts', () => ({
  useCohortDetail: () => useCohortDetailMock(),
  useRefreshCohort: () => ({ mutate: vi.fn(), isPending: false }),
  useTenantCohortOptions: () => ({ data: undefined, isLoading: false }),
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

const baseRulesSummary = {
  is_static: false,
  member_count: 20,
  total_tenant_buyers: 100,
  matched_of_total_label: '20 of 100 buyers',
  filters: [] as { label: string; value_text: string }[],
};

function cohortDetailFixture(overrides: Record<string, unknown> = {}) {
  return {
    header: {
      id: 'c1',
      cohort_name: 'Maharashtra Premium',
      status_label: 'Active',
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
      active_member_count: 10,
      member_count: 20,
      sales_qtd_value: 120000,
      sales_qtd_count: 24,
      demand_qtd_value: 140000,
      demand_qtd_count: 30,
      brands_count: 5,
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
    buyers: [],
    rules_summary: { ...baseRulesSummary },
    ...overrides,
  };
}

describe('cohort detail page', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useCohortDetailMock.mockReset();
  });

  it('renders the Buyers tab and hides Performance', () => {
    useCohortDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: cohortDetailFixture(),
    });

    render(<CohortDetailPage id="c1" />);

    expect(screen.getByRole('tab', { name: 'Buyers' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Performance' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit customer group/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Activity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Members/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Catalogs/i })).not.toBeInTheDocument();
  });

  it('renders Buyers tab rules and table when selected', () => {
    useCohortDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: cohortDetailFixture({
        buyers: [
          {
            buyer_id: 'b1',
            business_name: 'Mehta Brothers',
            contact_name: 'R. Mehta',
            external_ref: null,
            geography_label: 'Mumbai, Maharashtra',
            tier: 'A' as const,
            mtd_spend: 10000,
            orders_mtd: 2,
            aov: 5000,
            credit_used: 1000,
            last_order_at: '2026-05-01T00:00:00.000Z',
            initials: 'MB',
            hue: 'teal' as const,
          },
        ],
      }),
    });

    render(<CohortDetailPage id="c1" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Buyers' }));

    expect(screen.getByText('Filters applied')).toBeInTheDocument();
    expect(screen.getByText('Mehta Brothers')).toBeInTheDocument();
  });

  it('renders exactly 4 meta strip tiles and keeps members count in subtitle', () => {
    useCohortDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: cohortDetailFixture(),
    });

    render(<CohortDetailPage id="c1" />);

    const metaStripSection = screen.getByText('Invoiced sales 90D').closest('section');
    expect(metaStripSection).toBeTruthy();
    const withinMeta = within(metaStripSection!);

    expect(withinMeta.getByText('Invoiced sales 90D')).toBeInTheDocument();
    expect(withinMeta.getByText('Members who purchased')).toBeInTheDocument();
    expect(withinMeta.getByText('Avg invoice value')).toBeInTheDocument();
    expect(withinMeta.getByText('Response rate')).toBeInTheDocument();
    expect(screen.queryByText(/^Members$/i)).not.toBeInTheDocument();
    expect(screen.getByText('20 of 100 buyers')).toBeInTheDocument();
  });

});
