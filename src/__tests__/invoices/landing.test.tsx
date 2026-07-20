import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantInvoicesMock = vi.fn();
const useTenantInvoicesInfiniteMock = vi.fn();
const useFlagStateMock = vi.fn();
const useCreateFlagsMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/invoices',
}));

vi.mock('@/hooks/useInvoices', () => ({
  useTenantInvoices: () => useTenantInvoicesMock(),
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
import type { TenantInvoicesResponse } from '@/hooks/useInvoices';

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

describe('invoices landing page', () => {
  beforeEach(() => {
    sessionStorage.clear();
    pushMock.mockReset();
    useTenantInvoicesMock.mockReset();
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
    expect(screen.getByText('2 invoices in this month.')).toBeInTheDocument();
  });

  it('renders invoice KPI strip and callout rail', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getByRole('button', { name: /Period: This Month/i })).toBeInTheDocument();
    expect(screen.queryByText('Showing')).not.toBeInTheDocument();
    expect(screen.getByText('Invoiced sales')).toBeInTheDocument();
    expect(screen.getByText('Outstanding amount')).toBeInTheDocument();
    expect(screen.getByText('Overdue amount')).toBeInTheDocument();
    expect(screen.getByText('Due in 7 days')).toBeInTheDocument();
    expect(screen.getByText('2 invoices this period')).toBeInTheDocument();
    expect(screen.getByText('2 invoices · 2 customers')).toBeInTheDocument();
    expect(screen.getByText('1 invoices · 1 customers')).toBeInTheDocument();
    expect(screen.getByText('Largest overdue balances')).toBeInTheDocument();
    expect(screen.getByText('High-value invoices due soon')).toBeInTheDocument();
    expect(screen.getByText('Newly overdue invoices')).toBeInTheDocument();
  });

  it('renders invoice supporting text and opens the callout detail sheet', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getAllByText('INV-2026-0002 · Due 01 Jun 2026').length).toBeGreaterThan(0);
    expect(screen.getByText('INV-2026-0003 · Due 14 Jun 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /open full largest overdue balances list/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Beta').length).toBeGreaterThan(0);
  });

  it('Overdue filter hides non-overdue invoices', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Status: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(screen.getByText('INV-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('INV-2026-0001')).not.toBeInTheDocument();
  });

  it('renders place of supply, source support text, and outstanding amount in the table', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getByText('Place of Supply')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getAllByText('MH').length).toBeGreaterThan(0);
    expect(screen.getByText('SO-2026-0042')).toBeInTheDocument();
    expect(screen.queryByText('seller_app')).not.toBeInTheDocument();
    expect(screen.getAllByText('₹5,000').length).toBeGreaterThanOrEqual(2);
  });

  it('row click navigates to invoice detail', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    fireEvent.click(screen.getByText('INV-2026-0002').closest('tr')!);
    expect(pushMock).toHaveBeenCalledWith('/invoices/inv-overdue');
  });

  it('df_invoices OFF shows flag-off empty state', () => {
    useFlagStateMock.mockImplementation((k: string) => k !== 'INVOICES');
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
  });
});
