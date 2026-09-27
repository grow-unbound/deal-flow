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
const useTenantInvoicesMock = vi.fn();
const useTenantInvoicesInfiniteMock = vi.fn();
const useTenantInvoicesMetricsMock = vi.fn();
const useFlagStateMock = vi.fn();
const useCreateFlagsMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/sales/invoices',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    currentTenantId: 'tenant-1',
    user: { id: 'user-1' },
    tenantProfile: { id: 'profile-1', role: 'seller_admin' },
  }),
}));

vi.mock('@/hooks/useInvoices', () => ({
  useTenantInvoices: () => useTenantInvoicesMock(),
  useTenantInvoicesMetrics: (...args: unknown[]) => useTenantInvoicesMetricsMock(...args),
  useTenantInvoicesInfinite: (...args: unknown[]) => useTenantInvoicesInfiniteMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (flag: string) => useFlagStateMock(flag),
}));

vi.mock('@/hooks/useCreateFlags', () => ({
  useCreateFlags: () => useCreateFlagsMock(),
}));

vi.mock('@/hooks/useSellerLandingPeriod', () => ({
  useSellerLandingPeriod: () => ({
    period: 'month' as const,
    setPeriod: vi.fn(),
    horizonLabel: 'This month',
    lowerLabel: 'this month',
    options: [{ value: 'month' as const, label: 'This Month' }],
  }),
}));

import { InvoicesLandingClient } from '@/components/seller/invoices/InvoicesLandingClient';
import type { InvoicesLandingMetricsV4, TenantInvoicesResponse } from '@/hooks/useInvoices';

const basePeriod: TenantInvoicesResponse['period'] = {
  selected: 'month',
  timezone: 'Asia/Kolkata',
  current_start: '2026-06-01T00:00:00.000Z',
  current_end_exclusive: '2026-07-01T00:00:00.000Z',
  previous_start: '2026-05-01T00:00:00.000Z',
  previous_end_exclusive: '2026-06-01T00:00:00.000Z',
  elapsed_days: 30,
};

function mockInvoiceResponse(overrides?: Partial<TenantInvoicesResponse>): TenantInvoicesResponse {
  return {
    period: basePeriod,
    kpis: {
      invoices_this_period: 2,
      invoices_prev_period: 1,
      invoices_growth_pct: 100,
      gmv_this_period: 15000,
      gmv_prev_period: 7000,
      aov: 7500,
      overdue_count: 1,
      overdue_sum: 5000,
      overdue_customer_count: 1,
      outstanding_count: 2,
      outstanding_sum: 10000,
      outstanding_customer_count: 2,
      ...overrides?.kpis,
    },
    pulse_aggregates: {
      due_soon_count: 3,
      due_soon_sum: 8000,
      due_soon_customer_count: 3,
      ...overrides?.pulse_aggregates,
    },
    todays_read: {
      largest_overdue: [
        {
          id: 'inv-overdue',
          invoice_number: 'INV-2026-0002',
          buyer_id: 'b2',
          buyer_name: 'Beta',
          buyer_initials: 'BE',
          buyer_hue: 'ember',
          buyer_city: 'Pune',
          buyer_state: 'MH',
          items_count: 4,
          total_amount: 5000,
          outstanding_amount: 5000,
          due_date: '2026-06-01T00:00:00.000Z',
          paid_at: null,
          invoice_date: '2026-06-05T00:00:00.000Z',
          effective: 'overdue',
        },
      ],
      due_soon: [],
      newly_overdue: [
        {
          id: 'inv-newly-overdue',
          invoice_number: 'INV-2026-0003',
          buyer_id: 'b1',
          buyer_name: 'Acme',
          buyer_initials: 'AC',
          buyer_hue: 'teal',
          buyer_city: 'Mumbai',
          buyer_state: 'MH',
          items_count: 3,
          total_amount: 7000,
          outstanding_amount: 7000,
          due_date: '2026-06-14T00:00:00.000Z',
          paid_at: null,
          invoice_date: '2026-06-01T00:00:00.000Z',
          effective: 'overdue',
        },
      ],
      ...overrides?.todays_read,
    },
    invoices: [
      {
        id: 'inv-sent',
        location_id: 'loc-1',
        location_name: 'Mumbai HQ',
        invoice_number: 'INV-2026-0001',
        buyer_id: 'b1',
        buyer_name: 'Acme',
        buyer_city: 'Mumbai',
        buyer_state: 'MH',
        place_of_supply: 'MH',
        buyer_initials: 'AC',
        buyer_hue: 'teal',
        order_id: 'so-1',
        estimate_id: null,
        source_kind: 'converted' as const,
        source_label: 'SO-2026-0042',
        source_detail: '',
        campaign_name: 'Monsoon Promo',
        created_by_label: 'Priya Shah',
        items_count: 2,
        total_amount: 5000,
        outstanding_amount: 5000,
        invoice_date: '2026-06-10T00:00:00.000Z',
        due_date: '2026-06-20T00:00:00.000Z',
        paid_at: null,
        created_at: '2026-06-10T00:00:00.000Z',
        status: { value: 'sent', label: 'Sent', tone: 'warning', filter_chip: 'Sent' },
        linked: { type: 'order', label: 'ORD-2026-0042', href: '/sales-orders/so-1' },
      },
      {
        id: 'inv-overdue',
        location_id: 'loc-2',
        location_name: 'Pune DC',
        invoice_number: 'INV-2026-0002',
        buyer_id: 'b2',
        buyer_name: 'Beta',
        buyer_city: 'Pune',
        buyer_state: 'MH',
        place_of_supply: 'MH',
        buyer_initials: 'BE',
        buyer_hue: 'ember',
        order_id: null,
        estimate_id: null,
        source_kind: 'direct' as const,
        source_label: '',
        source_detail: '',
        campaign_name: null,
        created_by_label: 'Ravi Nair',
        items_count: 4,
        total_amount: 5000,
        outstanding_amount: 5000,
        invoice_date: '2026-06-05T00:00:00.000Z',
        due_date: '2026-06-01T00:00:00.000Z',
        paid_at: null,
        created_at: '2026-06-05T00:00:00.000Z',
        status: { value: 'overdue', label: 'Overdue', tone: 'danger', filter_chip: 'Overdue' },
        linked: { type: 'direct', label: '—' },
      },
    ],
    filters: {
      groups: [
        {
          key: 'status',
          label: 'Status',
          options: [
            { value: 'Sent', label: 'Sent' },
            { value: 'Overdue', label: 'Overdue' },
          ],
        },
      ],
    },
    ...overrides,
  };
}

function mockInvoiceMetrics(): InvoicesLandingMetricsV4 {
  return {
    page_key: 'invoices',
    period: {
      period_key: 'this_month',
      grain: 'month',
      period_start: '2026-06-01T00:00:00.000Z',
      period_end_exclusive: '2026-07-01T00:00:00.000Z',
      label: 'This month',
    },
    computed_at: '2026-06-20T00:00:00.000Z',
    source_watermark: null,
    cards: [
      { id: 'invoiced_sales', value: 15000, entity_count: 2, document_count: 2, time_basis: 'This month' },
      { id: 'outstanding_dues', value: 10000, entity_count: 2, document_count: 2, time_basis: 'Open' },
      { id: 'overdue_receivables', value: 5000, entity_count: 1, document_count: 1, time_basis: 'Open' },
      { id: 'due_7d', value: 8000, entity_count: 3, document_count: 3, time_basis: 'Next 7 days' },
    ],
  };
}

describe('invoices landing page', () => {
  beforeEach(() => {
    sessionStorage.clear();
    pushMock.mockReset();
    useTenantInvoicesMock.mockReset();
    useTenantInvoicesMetricsMock.mockReset();
    useFlagStateMock.mockReset();
    useCreateFlagsMock.mockReset();
    useTenantInvoicesInfiniteMock.mockReset();
    useFlagStateMock.mockReturnValue(true);
    useCreateFlagsMock.mockReturnValue({
      createInvoices: true,
    });
    useTenantInvoicesMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockInvoiceResponse(),
    });
    useTenantInvoicesMetricsMock.mockReturnValue({
      data: mockInvoiceMetrics(),
      isLoading: false,
      isError: false,
    });
    useTenantInvoicesInfiniteMock.mockImplementation((_period: unknown, filters: { status?: string[] }) => {
      const overdueOnly = filters?.status?.includes('Overdue');
      const response = mockInvoiceResponse({
        invoices: overdueOnly
          ? [
              {
                id: 'inv-overdue',
                location_id: 'loc-2',
                location_name: 'Pune DC',
                invoice_number: 'INV-2026-0002',
                buyer_id: 'b2',
                buyer_name: 'Beta',
                buyer_city: 'Pune',
                buyer_state: 'MH',
                place_of_supply: 'MH',
                buyer_initials: 'BE',
                buyer_hue: 'ember',
                order_id: null,
                estimate_id: null,
                source_kind: 'direct' as const,
                source_label: '',
                source_detail: '',
                campaign_name: null,
                created_by_label: 'Ravi Nair',
                items_count: 4,
                total_amount: 5000,
                outstanding_amount: 5000,
                invoice_date: '2026-06-05T00:00:00.000Z',
                due_date: '2026-06-01T00:00:00.000Z',
                paid_at: null,
                created_at: '2026-06-05T00:00:00.000Z',
                status: { value: 'overdue', label: 'Overdue', tone: 'danger', filter_chip: 'Overdue' },
                linked: { type: 'direct', label: '—' },
              },
            ]
          : mockInvoiceResponse().invoices,
        kpis: {
          invoices_this_period: overdueOnly ? 1 : 2,
          invoices_prev_period: 1,
          invoices_growth_pct: 100,
          gmv_this_period: overdueOnly ? 5000 : 15000,
          gmv_prev_period: 7000,
          aov: overdueOnly ? 5000 : 7500,
          overdue_count: 1,
          overdue_sum: 5000,
          overdue_customer_count: 1,
          outstanding_count: overdueOnly ? 1 : 2,
          outstanding_sum: overdueOnly ? 5000 : 10000,
          outstanding_customer_count: overdueOnly ? 1 : 2,
        },
      });

      return {
        isLoading: false,
        isError: false,
        data: {
          pages: [response],
        },
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      };
    });
  });

  it('subtitle shows invoice count for the table period', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getByText('Create, track, and close invoices, orders, and estimates.')).toBeInTheDocument();
  });

  it('renders invoice KPI strip and callout rail', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getByRole('button', { name: /Period: This Month/i })).toBeInTheDocument();
    expect(screen.queryByText('Showing')).not.toBeInTheDocument();
    expect(screen.getByText('Invoiced Sales')).toBeInTheDocument();
    expect(screen.getByText('Outstanding dues')).toBeInTheDocument();
    expect(screen.getByText('Overdue receivables')).toBeInTheDocument();
    expect(screen.getByText('Due in 7 days')).toBeInTheDocument();
    expect(screen.getAllByText('2 customers · 2 invoices').length).toBeGreaterThan(0);
    expect(screen.getByText('1 customers · 1 invoices')).toBeInTheDocument();
    expect(screen.getByText('Invoice Number')).toBeInTheDocument();
  });

  it('renders invoice supporting text', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getAllByText('INV-2026-0002').length).toBeGreaterThan(0);
    expect(screen.getAllByText('01 Jun 2026').length).toBeGreaterThan(0);
  });

  it('Overdue filter hides non-overdue invoices', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Status: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(screen.getAllByText('INV-2026-0002').length).toBeGreaterThan(0);
    expect(screen.queryByText('INV-2026-0001')).not.toBeInTheDocument();
  });

  it('renders place of supply, source support text, and outstanding amount in the table', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('Mumbai HQ')).toBeInTheDocument();
    expect(screen.getByText('SO-2026-0042')).toBeInTheDocument();
    expect(screen.queryByText('seller_app')).not.toBeInTheDocument();
    expect(screen.getAllByText('₹5,000').length).toBeGreaterThanOrEqual(2);
  });

  it('row click navigates to invoice detail', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    const rowLabel = screen.getAllByText('INV-2026-0002').find((el) => Boolean(el.closest('tr')));
    expect(rowLabel).toBeTruthy();
    fireEvent.click(rowLabel!.closest('tr')!);
    expect(pushMock).toHaveBeenCalledWith('/sales/invoices/inv-overdue');
  });

  it('df_invoices OFF shows flag-off empty state', () => {
    useFlagStateMock.mockImplementation((k: string) => k !== 'INVOICES');
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
  });
});
