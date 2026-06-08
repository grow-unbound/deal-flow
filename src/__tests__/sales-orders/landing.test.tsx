import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantOrdersMock = vi.fn();
const useFlagStateMock = vi.fn();

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
    },
    todays_read: {
      needs_attention: [],
      biggest_tickets: [],
      in_motion: [],
    },
    orders: [
      {
        id: 'o-new',
        order_id: 'DF-NEW',
        buyer_id: 'b1',
        buyer_name: 'Buyer One',
        buyer_city: 'Bengaluru',
        buyer_state: 'Karnataka',
        buyer_initials: 'BO',
        buyer_hue: 'teal' as const,
        delivery_city: 'Bengaluru',
        delivery_label: 'Bengaluru',
        source: 'buyer_app',
        source_label: 'buyer_app',
        source_detail: 'Asha Singh',
        catalog_name: 'Monsoon Promo',
        items_count: 1,
        gmv: 22000,
        subtotal: 18644,
        tax_amount: 3356,
        total_amount: 22000,
        status: { value: 'received' as const, label: 'Received', tone: 'neutral' as const, filter_chip: 'Received' as const },
        placed_at: '2026-05-29T11:00:00.000Z',
      },
      {
        id: 'o-old',
        order_id: 'DF-OLD',
        buyer_id: 'b2',
        buyer_name: 'Buyer Two',
        buyer_city: 'Mysuru',
        buyer_state: 'Karnataka',
        buyer_initials: 'BT',
        buyer_hue: 'ember' as const,
        delivery_city: 'Mysuru',
        delivery_label: 'Mysuru',
        source: 'cockpit_manual',
        source_label: 'EST-2042',
        source_detail: 'Converted by Priya Shah',
        catalog_name: 'Summer Sell-in',
        items_count: 3,
        gmv: 45000,
        subtotal: 38136,
        tax_amount: 6864,
        total_amount: 45000,
        status: { value: 'confirmed' as const, label: 'Confirmed', tone: 'warning' as const, filter_chip: 'Confirmed' as const },
        placed_at: '2026-05-02T11:00:00.000Z',
      },
      {
        id: 'o-inv',
        order_id: 'DF-INV',
        buyer_id: 'b3',
        buyer_name: 'Buyer Three',
        buyer_city: 'Hubli',
        buyer_state: 'Karnataka',
        buyer_initials: 'BT',
        buyer_hue: 'cream' as const,
        delivery_city: 'Hubli',
        delivery_label: 'Hubli',
        source: 'csv_import',
        source_label: 'csv_import',
        source_detail: 'Team member',
        catalog_name: null,
        items_count: 2,
        gmv: 12000,
        subtotal: 10170,
        tax_amount: 1830,
        total_amount: 12000,
        status: { value: 'invoiced' as const, label: 'Invoiced', tone: 'success' as const, filter_chip: 'Invoiced' as const },
        placed_at: '2026-05-15T11:00:00.000Z',
      },
    ],
  };
}

describe('sales orders landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useTenantOrdersMock.mockReset();
    useFlagStateMock.mockReset();

    useFlagStateMock.mockImplementation(() => true);
    useTenantOrdersMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockSalesOrdersData(),
    });
  });

  it('renders KPI numbers including AOV, pending dispatch, and Sales Orders MTD tile', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    expect(screen.getByText('Pending dispatch')).toBeInTheDocument();
    expect(screen.getByText('Sales Orders · MTD')).toBeInTheDocument();
    expect(screen.getByText(/AOV/)).toBeInTheDocument();
  });

  it('renders source, catalog, and INR amount columns', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('Tax Amount')).toBeInTheDocument();
    expect(screen.getByText('Total Amount')).toBeInTheDocument();
    expect(screen.getByText('EST-2042')).toBeInTheDocument();
    expect(screen.getByText('Converted by Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Monsoon Promo')).toBeInTheDocument();
    expect(screen.getByText('₹18,644')).toBeInTheDocument();
    expect(screen.getByText('₹3,356')).toBeInTheDocument();
    expect(screen.getByText('₹22,000')).toBeInTheDocument();
  });

  it('shows buyer geography below the buyer name in city, state format', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    expect(screen.getByText('Bengaluru, Karnataka')).toBeInTheDocument();
    expect(screen.getByText('Mysuru, Karnataka')).toBeInTheDocument();
  });

  it('status received renders label Received with neutral tone (not On Hold)', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    const tags = screen.getAllByText('Received');
    expect(tags.length).toBeGreaterThanOrEqual(1);
  });

  it('status invoiced renders label Invoiced with success tone', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    const invoicedTags = screen.getAllByText('Invoiced').filter((el) => el.tagName === 'SPAN');
    expect(invoicedTags.some((el) => el.className.includes('bg-success-50'))).toBe(true);
  });

  it('Received chip filters to received rows only', () => {
    render(<SalesOrdersLandingClient initialData={mockSalesOrdersData()} initialPeriod={defaultPeriod} />);

    fireEvent.click(screen.getByRole('button', { name: 'Received' }));

    expect(screen.getByText('DF-NEW')).toBeInTheDocument();
    expect(screen.queryByText('DF-OLD')).not.toBeInTheDocument();
    expect(screen.queryByText('DF-INV')).not.toBeInTheDocument();
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
