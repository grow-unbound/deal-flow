import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// TransactionTable now calls useQueryClient() for press-to-prefetch — needs a real provider.
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const pushMock = vi.fn();
const useTenantEstimatesMock = vi.fn();
const useTenantEstimatesInfiniteMock = vi.fn();
const useTenantEstimatesMetricsMock = vi.fn();
const useFlagMock = vi.fn();
const useCreateFlagsMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/estimates',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useEstimates', () => ({
  useTenantEstimates: () => useTenantEstimatesMock(),
  useTenantEstimatesInfinite: (...args: unknown[]) => useTenantEstimatesInfiniteMock(...args),
  useTenantEstimatesMetrics: (...args: unknown[]) => useTenantEstimatesMetricsMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/hooks/useCreateFlags', () => ({
  useCreateFlags: () => useCreateFlagsMock(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ currentTenantId: 'tenant-1' }),
}));

vi.mock('@/contexts/SellerRealtimeContext', () => ({
  useSellerRealtimeContext: () => ({
    newEntityIds: new Set<string>(),
    markSeen: vi.fn(),
  }),
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
        location_id: 'loc-1',
        location_name: 'Mumbai HQ',
        estimate_number: 'EST-1',
        buyer_id: 'b1',
        buyer_name: 'Buyer One',
        buyer_city: 'Mumbai',
        buyer_state: 'MH',
        place_of_supply: 'Maharashtra',
        buyer_initials: 'BO',
        buyer_hue: 'teal' as const,
        source: 'buyer_app' as const,
        source_kind: 'buyer_app' as const,
        source_label: 'BUYER APP',
        source_detail: '',
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
        location_id: 'loc-2',
        location_name: 'Delhi Depot',
        estimate_number: 'EST-2',
        buyer_id: 'b2',
        buyer_name: 'Buyer Two',
        buyer_city: 'Delhi',
        buyer_state: 'DL',
        place_of_supply: 'Delhi',
        buyer_initials: 'BT',
        buyer_hue: 'ember' as const,
        source: 'seller' as const,
        source_kind: 'seller' as const,
        source_label: '',
        source_detail: '',
        catalog_name: 'Clearance Push',
        created_by_label: 'Priya Shah',
        items_count: 1,
        total_amount: 2000,
        expires_at: null,
        created_at: '2026-06-09T10:00:00.000Z',
        accepted_at: '2026-06-09T12:00:00.000Z',
        sent_at: null,
        status: { value: 'converted' as const, label: 'Converted', tone: 'success' as const, filter_chip: 'Converted' as const },
      },
      {
        id: 'e3',
        location_id: null,
        location_name: null,
        estimate_number: 'EST-3',
        buyer_id: 'b2',
        buyer_name: 'Buyer Two',
        buyer_city: 'Delhi',
        buyer_state: 'DL',
        place_of_supply: 'Delhi',
        buyer_initials: 'BT',
        buyer_hue: 'ember' as const,
        source: 'buyer_app' as const,
        source_kind: 'buyer_app' as const,
        source_label: 'BUYER APP',
        source_detail: '',
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

function mockEstimatesMetrics() {
  return {
    page_key: 'estimates',
    period: {
      period_key: 'this_month',
      grain: 'month',
      period_start: '2026-06-01',
      period_end_exclusive: '2026-07-01',
      label: 'This Month',
    },
    computed_at: '2026-06-10T10:00:00.000Z',
    source_watermark: null,
    cards: [
      { id: 'estimate_value_created', label: 'Estimate value created', value: 3500, document_count: 3, supporting_text: '3 estimates', filter_preset: { date_period: 'this_month' } },
      { id: 'open_estimates', label: 'Open estimates', value: 1000, document_count: 1, supporting_text: '1 open estimate', filter_preset: { status: 'open' } },
      { id: 'awaiting_action_3d', label: 'Awaiting action 3+ days', value: 0, document_count: 0, supporting_text: '0 sent estimates', filter_preset: { status: 'sent', age_gte_days: 3 } },
      { id: 'expiring_7d', label: 'Expiring in 7 days', value: 0, document_count: 0, supporting_text: '0 unresolved estimates', filter_preset: { expiry_lte_days: 7 } },
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
    useTenantEstimatesInfiniteMock.mockReset();
    useTenantEstimatesMetricsMock.mockReset();
    useFlagMock.mockReset();
    useCreateFlagsMock.mockReset();
    useFlagMock.mockReturnValue(true);
    useCreateFlagsMock.mockReturnValue({
      createEstimates: true,
      createSalesOrders: true,
      createInvoices: true,
    });
    useTenantEstimatesMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockEstimatesData(),
    });
    useTenantEstimatesMetricsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockEstimatesMetrics(),
    });
    useTenantEstimatesInfiniteMock.mockReturnValue({
      data: { pages: [mockEstimatesData()] },
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
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

  it('renders the estimates KPI strip and default month period filter', () => {
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    expect(screen.getByRole('button', { name: /Period: This Month/i })).toBeInTheDocument();
    expect(screen.queryByText('Showing')).not.toBeInTheDocument();
    // KPI tiles are clickable (selecting one drives the split-pane header title),
    // so each renders with role="button" rather than the plain article role.
    const gmvTile = screen.getByRole('button', { name: /Estimate value created/ });
    expect(gmvTile).toHaveTextContent('3 estimates');
    expect(screen.getByRole('button', { name: /Open estimates/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Awaiting action 3\+ days/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Expiring in 7 days/ })).toBeInTheDocument();
  });

  it('shows converted and invoiced rows in the table', () => {
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    expect(screen.getAllByText('EST-2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('EST-3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Converted').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Invoiced').length).toBeGreaterThan(0);
  });

  it('shows buyer-app origin marks beside estimate numbers', () => {
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    expect(screen.getAllByLabelText('Buyer App Estimate').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByLabelText('Store Estimate').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('BUYER APP')).not.toBeInTheDocument();
    expect(screen.queryByText('created by Priya Shah')).not.toBeInTheDocument();
  });

  it('renders campaign column and origin marks in the landing table', () => {
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    expect(screen.getByText('Summer 2026 Retail')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Buyer App Estimate').length).toBeGreaterThan(0);
  });

  it('navigates to estimate detail on row click', () => {
    render(<EstimatesLandingClient initialData={null} initialPeriod="month" />);
    const mono = screen.getAllByText('EST-1').find((el) => el.classList.contains('font-medium') && Boolean(el.closest('tr')));
    expect(mono).toBeTruthy();
    fireEvent.click(mono!.closest('tr')!);
    expect(pushMock).toHaveBeenCalledWith('/estimates/e1');
  });
});
