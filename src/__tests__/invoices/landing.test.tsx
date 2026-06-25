import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantInvoicesMock = vi.fn();
const useTenantInvoicesInfiniteMock = vi.fn();
const useFlagStateMock = vi.fn();

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
      outstanding_count: 2,
      outstanding_sum: 10000,
      ...overrides?.kpis,
    },
    todays_read: {
      needs_attention: [
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
      top_spenders: [],
      top_risers: [
        {
          buyer_id: 'b1',
          buyer_name: 'Acme',
          buyer_initials: 'AC',
          buyer_hue: 'teal',
          buyer_city: 'Mumbai',
          buyer_state: 'MH',
          current_gmv: 10000,
          previous_gmv: 3000,
          delta_gmv: 7000,
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
        buyer_initials: 'AC',
        buyer_hue: 'teal',
        order_id: 'so-1',
        estimate_id: null,
        source_label: 'SO-2026-0042',
        source_detail: 'Converted by Priya Shah',
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
        buyer_initials: 'BE',
        buyer_hue: 'ember',
        order_id: null,
        estimate_id: null,
        source_label: 'seller_app',
        source_detail: 'Created by Ravi Nair',
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
    useTenantInvoicesInfiniteMock.mockReset();
    useFlagStateMock.mockReturnValue(true);
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
                buyer_initials: 'BE',
                buyer_hue: 'ember',
                order_id: null,
                estimate_id: null,
                source_label: 'seller_app',
                source_detail: 'Created by Ravi Nair',
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
          outstanding_count: overdueOnly ? 1 : 2,
          outstanding_sum: overdueOnly ? 5000 : 10000,
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

  it('subtitle includes overdue count from KPI payload', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getByText(/2 still due and 1 overdue\./)).toBeInTheDocument();
  });

  it('renders invoice KPI strip and callout rail', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getByText('Invoices · MTD')).toBeInTheDocument();
    expect(screen.getByText('GMV')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    expect(screen.getByText('Top Spenders')).toBeInTheDocument();
    expect(screen.getByText('Top Risers')).toBeInTheDocument();
  });

  it('Overdue filter hides non-overdue invoices', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    fireEvent.click(screen.getByRole('button', { name: 'Status: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(screen.getByText('INV-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('INV-2026-0001')).not.toBeInTheDocument();
  });

  it('renders buyer geography, source, items, and due amount in the table', () => {
    render(<InvoicesLandingClient initialData={mockInvoiceResponse()} initialPeriod="month" />);
    expect(screen.getByText('Mumbai, MH')).toBeInTheDocument();
    expect(screen.getByText('SO-2026-0042')).toBeInTheDocument();
    expect(screen.getByText('Converted by Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Created by Ravi Nair')).toBeInTheDocument();
    expect(screen.getAllByText('₹5,000 due')).toHaveLength(2);
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
