import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantEstimatesMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/estimates',
}));

vi.mock('@/hooks/useEstimates', () => ({
  useTenantEstimates: () => useTenantEstimatesMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

import { EstimatesLandingClient } from '@/components/seller/estimates/EstimatesLandingClient';

const basePeriod = {
  selected: 'month' as const,
  timezone: 'Asia/Kolkata',
  current_start: '2026-06-01T00:00:00.000Z',
  current_end_exclusive: '2026-07-01T00:00:00.000Z',
  previous_start: '2026-05-01T00:00:00.000Z',
  previous_end_exclusive: '2026-06-01T00:00:00.000Z',
  elapsed_days: 30,
};

function mockEstimatesData() {
  return {
    period: basePeriod,
    kpis: {
      total_estimates_this_period: 3,
      total_estimates_prev_period: 2,
      total_estimates_growth_pct: 50,
      total_gmv_this_period: 3500,
      total_gmv_prev_period: 2500,
      aov: 1166.67,
      open_estimates_this_period: 1,
      converted_this_period: 2,
      open_total: 1,
      open_drafts: 0,
      open_sent: 0,
      open_accepted: 1,
      ready_to_convert: 1,
      expiring_soon: 1,
      open_created_this_period: 1,
      buyer_app_created_this_period: 1,
    },
    todays_read: {
      needs_follow_up: [],
      ready_to_convert: [],
      expiring_soon: [],
    },
    estimates: [
      {
        id: 'e1',
        estimate_number: 'EST-1',
        buyer_id: 'b1',
        buyer_name: 'Buyer One',
        buyer_city: 'Mumbai',
        buyer_state: 'MH',
        buyer_initials: 'BO',
        buyer_hue: 'teal' as const,
        source: 'buyer_app' as const,
        source_label: 'Buyer App',
        source_detail: 'Submitted via Buyer App',
        catalog_name: 'Summer 2026 Retail',
        created_by_label: null,
        items_count: 2,
        total_amount: 1000,
        expires_at: null,
        created_at: '2026-06-10T10:00:00.000Z',
        accepted_at: null,
        sent_at: null,
        status: { value: 'accepted' as const, label: 'Accepted', tone: 'success' as const, filter_chip: 'Accepted' as const },
      },
      {
        id: 'e2',
        estimate_number: 'EST-2',
        buyer_id: 'b2',
        buyer_name: 'Buyer Two',
        buyer_city: 'Delhi',
        buyer_state: 'DL',
        buyer_initials: 'BT',
        buyer_hue: 'ember' as const,
        source: 'seller' as const,
        source_label: 'created by Priya Shah',
        source_detail: 'Manual seller entry',
        catalog_name: 'Clearance Push',
        created_by_label: 'Priya Shah',
        items_count: 1,
        total_amount: 2000,
        expires_at: null,
        created_at: '2026-06-09T10:00:00.000Z',
        accepted_at: '2026-06-09T12:00:00.000Z',
        sent_at: null,
        status: { value: 'converted' as const, label: 'Converted to SO', tone: 'success' as const, filter_chip: 'Converted' as const },
      },
      {
        id: 'e3',
        estimate_number: 'EST-3',
        buyer_id: 'b2',
        buyer_name: 'Buyer Two',
        buyer_city: 'Delhi',
        buyer_state: 'DL',
        buyer_initials: 'BT',
        buyer_hue: 'ember' as const,
        source: 'buyer_app' as const,
        source_label: 'Buyer App',
        source_detail: 'Submitted via Buyer App',
        catalog_name: null,
        created_by_label: null,
        items_count: 1,
        total_amount: 500,
        expires_at: null,
        created_at: '2026-06-08T10:00:00.000Z',
        accepted_at: '2026-06-08T12:00:00.000Z',
        sent_at: null,
        status: { value: 'invoiced' as const, label: 'Invoiced', tone: 'success' as const, filter_chip: 'Converted' as const },
      },
    ],
  };
}

describe('estimates landing page', () => {
  beforeEach(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }

    window.scrollTo = vi.fn() as typeof window.scrollTo;

    pushMock.mockReset();
    useTenantEstimatesMock.mockReset();
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
    useTenantEstimatesMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockEstimatesData(),
    });
  });

  it('shows feature disabled when df_estimates is off', () => {
    useFlagMock.mockImplementation((key: unknown) => {
      if (key === 'ESTIMATES') return false;
      return true;
    });
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    expect(screen.getByText(/This feature isn.t enabled yet/)).toBeInTheDocument();
  });

  it('renders the estimates KPI strip with period GMV, AOV and trend', () => {
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    const kpiArticles = screen.getAllByRole('article').slice(0, 4);
    expect(kpiArticles[0]).toHaveTextContent('Estimates · MTD');
    expect(kpiArticles[0]).toHaveTextContent('↑ +50% vs last period');
    expect(kpiArticles[1]).toHaveTextContent('GMV');
    expect(kpiArticles[1]).toHaveTextContent('AOV');
    expect(kpiArticles[2]).toHaveTextContent('Open estimates');
    expect(kpiArticles[3]).toHaveTextContent('Converted this month');
  });

  it('Converted chip shows converted and invoiced rows', () => {
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Converted' }));
    expect(screen.getByText('EST-2')).toBeInTheDocument();
    expect(screen.getByText('EST-3')).toBeInTheDocument();
    expect(screen.queryByText('EST-1')).not.toBeInTheDocument();
  });

  it('filters buyer app estimates with the source chips', () => {
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Buyer App' }));
    expect(screen.getByText('EST-1')).toBeInTheDocument();
    expect(screen.getByText('EST-3')).toBeInTheDocument();
    expect(screen.queryByText('EST-2')).not.toBeInTheDocument();
  });

  it('renders buyer geography, catalog and source details in the landing table', () => {
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    expect(screen.getByText('Mumbai, MH')).toBeInTheDocument();
    expect(screen.getByText('Summer 2026 Retail')).toBeInTheDocument();
    expect(screen.getByText('created by Priya Shah')).toBeInTheDocument();
    expect(screen.getAllByText('Submitted via Buyer App')).toHaveLength(2);
  });

  it('navigates to estimate detail on row click', () => {
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    const mono = screen.getAllByText('EST-1').find((el) => el.classList.contains('font-mono'));
    expect(mono).toBeTruthy();
    fireEvent.click(mono!.closest('tr')!);
    expect(pushMock).toHaveBeenCalledWith('/estimates/e1');
  });
});
