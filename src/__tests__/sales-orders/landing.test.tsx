import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantOrdersMock = vi.fn();
const useFlagStateMock = vi.fn();
const useCreateFlagsMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/sales-orders',
}));

vi.mock('@/hooks/useOrders', () => ({
  useTenantOrders: () => useTenantOrdersMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (...args: unknown[]) => useFlagStateMock(...args),
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

import { SalesOrdersLandingClient } from '@/components/seller/sales-orders/SalesOrdersLandingClient';
import type { TenantOrdersResponse } from '@/hooks/useOrders';
import type { SellerLandingPeriod, SellerLandingPeriodMeta } from '@/lib/seller-period';

const defaultPeriod: SellerLandingPeriod = 'month';

const mockPeriod: SellerLandingPeriodMeta = {
  selected: 'month',
  timezone: 'Asia/Kolkata',
  current_start: '2026-05-01T00:00:00.000Z',
  current_end_exclusive: '2026-06-01T00:00:00.000Z',
  previous_start: '2026-04-01T00:00:00.000Z',
  previous_end_exclusive: '2026-04-30T00:00:00.000Z',
  elapsed_days: 30,
};

function mockSalesOrdersData(): TenantOrdersResponse {
  return {
    period: mockPeriod,
    kpis: {
      orders_mtd: 4,
      orders_prev_mtd: 2,
      orders_growth_pct: 100,
      gmv_mtd: 100000,
      gmv_prev_mtd: 50000,
      aov: 25000,
      pending_dispatch_count: 1,
      received_count: 1,
      delivered_count: 1,
      buyers_mtd: 3,
      open_value: 67000,
      open_total: 2,
    },
    pulse_aggregates: {
      waiting_confirmation_count: 1,
      waiting_confirmation_value: 22000,
      waiting_dispatch_count: 1,
      waiting_dispatch_value: 45000,
    },
    todays_read: {
      needs_attention: [],
      to_dispatch: [],
      stock_shortage: [],
    },
    orders: [
      {
        id: 'o-new',
        location_id: 'loc-1',
        location_name: 'Bengaluru Hub',
        order_id: 'DF-NEW',
        buyer_id: 'b1',
        buyer_name: 'Buyer One',
        buyer_city: 'Bengaluru',
        buyer_state: 'Karnataka',
        place_of_supply: 'Karnataka',
        buyer_initials: 'BO',
        buyer_hue: 'teal' as const,
        delivery_city: 'Bengaluru',
        delivery_label: 'Bengaluru',
        source: 'buyer_app',
        source_kind: 'buyer_app' as const,
        source_label: 'BUYER_APP',
        source_detail: '',
        campaign_name: 'Monsoon Promo',
        catalog_name: 'Monsoon Promo',
        items_count: 1,
        gmv: 22000,
        subtotal: 18644,
        tax_amount: 3356,
        total_amount: 22000,
        status: { value: 'received' as const, label: 'Received', tone: 'neutral' as const, filter_chip: 'Received' as const },
        placed_at: '2026-05-29T11:00:00.000Z',
        confirmed_at: null,
        dispatched_at: null,
      },
      {
        id: 'o-old',
        location_id: 'loc-2',
        location_name: 'Mysuru Depot',
        order_id: 'DF-OLD',
        buyer_id: 'b2',
        buyer_name: 'Buyer Two',
        buyer_city: 'Mysuru',
        buyer_state: 'Karnataka',
        place_of_supply: 'Karnataka',
        buyer_initials: 'BT',
        buyer_hue: 'ember' as const,
        delivery_city: 'Mysuru',
        delivery_label: 'Mysuru',
        source: 'cockpit_manual',
        source_kind: 'converted' as const,
        source_label: 'EST-2042',
        source_detail: '',
        campaign_name: 'Summer Sell-in',
        catalog_name: 'Summer Sell-in',
        items_count: 3,
        gmv: 45000,
        subtotal: 38136,
        tax_amount: 6864,
        total_amount: 45000,
        status: { value: 'confirmed' as const, label: 'Confirmed', tone: 'warning' as const, filter_chip: 'Confirmed' as const },
        placed_at: '2026-05-02T11:00:00.000Z',
        confirmed_at: null,
        dispatched_at: null,
      },
      {
        id: 'o-inv',
        location_id: 'loc-1',
        location_name: 'Bengaluru Hub',
        order_id: 'DF-INV',
        buyer_id: 'b3',
        buyer_name: 'Buyer Three',
        buyer_city: 'Hubli',
        buyer_state: 'Karnataka',
        place_of_supply: 'Karnataka',
        buyer_initials: 'BT',
        buyer_hue: 'cream' as const,
        delivery_city: 'Hubli',
        delivery_label: 'Hubli',
        source: 'csv_import',
        source_kind: 'direct' as const,
        source_label: '',
        source_detail: '',
        campaign_name: null,
        catalog_name: null,
        items_count: 2,
        gmv: 12000,
        subtotal: 10170,
        tax_amount: 1830,
        total_amount: 12000,
        status: { value: 'invoiced' as const, label: 'Invoiced', tone: 'success' as const, filter_chip: 'Invoiced' as const },
        placed_at: '2026-05-15T11:00:00.000Z',
        confirmed_at: null,
        dispatched_at: null,
      },
    ],
  };
}

describe('sales orders landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useTenantOrdersMock.mockReset();
    useFlagStateMock.mockReset();
    useCreateFlagsMock.mockReset();

    useFlagStateMock.mockImplementation(() => true);
    useCreateFlagsMock.mockReturnValue({
      createEstimates: true,
      createSalesOrders: true,
      createInvoices: true,
    });
    useTenantOrdersMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockSalesOrdersData(),
    });
  });

  it('renders KPI numbers including AOV, pending dispatch, and Sales Orders MTD tile', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    expect(screen.getByRole('button', { name: /Period: This Month/i })).toBeInTheDocument();
    expect(screen.queryByText('Showing')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting to dispatch')).toBeInTheDocument();
    expect(screen.getByText('Order value created')).toBeInTheDocument();
    expect(screen.getByText('Waiting for confirmation')).toBeInTheDocument();
  });

  it('renders the updated transaction columns in the new order', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    expect(screen.getByText('Order Number')).toBeInTheDocument();
    expect(screen.getByText('Buyer Name')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Campaign')).toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('Total Amount')).toBeInTheDocument();
    expect(screen.getByText('DF-NEW')).toBeInTheDocument();
    expect(screen.getByText('Buyer One')).toBeInTheDocument();
    expect(screen.getAllByText('Bengaluru Hub').length).toBeGreaterThan(0);
    expect(screen.getByText('Monsoon Promo')).toBeInTheDocument();
    expect(screen.getAllByText('₹22.00K').length).toBeGreaterThan(0);
  });

  it('shows place_of_supply below the buyer name', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    expect(screen.getAllByText('Karnataka').length).toBeGreaterThan(0);
  });

  it('status received renders label Received with neutral tone (not On Hold)', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    const tags = screen.getAllByText('Received');
    expect(tags.length).toBeGreaterThanOrEqual(1);
  });

  it('status invoiced renders label Invoiced with success tone', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    expect(screen.getAllByText('Invoiced').length).toBeGreaterThan(0);
  });

  it('hides the campaign column when campaign publishing is off', () => {
    useFlagStateMock.mockImplementation((key: unknown) => (key === 'CATALOG_PUBLISHING' ? false : true));

    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    expect(screen.queryByText('Campaign')).not.toBeInTheDocument();
  });

  it('default sort is recent first and row click navigates to /sales-orders/{id}', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    const orderNodes = screen.getAllByText(/^DF-/);
    expect(orderNodes[0].textContent).toBe('DF-NEW');

    fireEvent.click(screen.getByText('DF-NEW'));
    expect(pushMock).toHaveBeenCalledWith('/sales-orders/o-new');
  });

  it('renders flag-off empty state when df_order_management is off', () => {
    useFlagStateMock.mockImplementation((key: unknown) => (key === 'ORDER_MANAGEMENT' ? false : true));

    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useTenantOrdersMock).not.toHaveBeenCalled();
  });

  it('renders flag-off empty state when df_sales_orders is off', () => {
    useFlagStateMock.mockImplementation((key: unknown) => (key === 'SALES_ORDERS' ? false : true));

    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useTenantOrdersMock).not.toHaveBeenCalled();
  });
});
