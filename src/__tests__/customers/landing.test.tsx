import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useCustomersLandingMetricsMock = vi.fn();
const useCustomersLandingInfiniteMock = vi.fn();
const useFlagMock = vi.fn();
const setRouteStateMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/customers',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useCustomersLanding', () => ({
  useCustomersLandingMetrics: () => useCustomersLandingMetricsMock(),
  useCustomersLanding: () => useCustomersLandingMetricsMock(),
  useCreateCustomerOptimistic: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCustomersLandingInfinite: (...args: unknown[]) => useCustomersLandingInfiniteMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
  useFlagState: (...args: unknown[]) => useFlagMock(...args),
}));

const useTenantSettingsMock = vi.fn(() => ({
  data: {
    modules: {
      orders: {
        features: {
          enquiries: true,
          sales_orders: true,
          invoices: true,
        },
      },
      buyer_app: {
        enabled: true,
      },
    },
  },
}));

vi.mock('@/hooks/useTenantSettings', () => ({
  // Mock is typed from its zero-arg factory — don't spread unknown[] into it.
  useTenantSettings: () => useTenantSettingsMock(),
}));

vi.mock('@/hooks/useBusinessPolicy', () => ({
  useBusinessPolicy: () => ({ creditEnabled: true, gstInclusive: false, gstRate: 18 }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    tenantProfile: { role: 'seller_admin' },
    currentTenantId: 'tenant-1',
  }),
}));

vi.mock('@/components/seller/InviteUserDialog', () => ({ InviteUserDialog: () => null }));

vi.mock('@/components/seller/customers/BroadcastComposerSheet', () => ({
  BroadcastComposerSheet: () => null,
}));
vi.mock('@/components/seller/customers/BroadcastHistorySection', () => ({
  BroadcastHistorySection: () => null,
}));

vi.mock('@/hooks/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({
    state: {
      filters: { filter_preset: null, selected_kpi_id: null },
      sortBy: 'Sales (high → low)',
      search: '',
    },
    setState: setRouteStateMock,
  }),
  useSeedRouteSearch: () => undefined,
  useRouteScrollRestoration: () => undefined,
}));

vi.mock('@/hooks/useRetainedValue', () => ({
  useRetainedValue: (value: unknown) => value,
}));

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

vi.mock('@/hooks/useInfiniteScroll', () => ({
  useInfiniteScroll: () => ({ sentinelRef: { current: null } }),
  getSentinelInsertIndex: () => -1,
}));

import { CustomersLandingClient } from '@/components/seller/customers/CustomersLandingClient';

const v4Metrics = {
  page_key: 'customers',
  period: {
    period_key: 'this_quarter',
    grain: 'quarter',
    period_start: '2026-04-01',
    period_end_exclusive: '2026-07-01',
    label: 'This Quarter',
  },
  computed_at: null,
  source_watermark: null,
  cards: [
    {
      id: 'active_customers',
      label: 'Active Customers',
      value: 6,
      supporting_text: 'purchased at least once',
      filter_preset: { purchased_gte: 1, period: 'this_quarter' },
    },
    {
      id: 'dormant_customers',
      label: 'Dormant Customers',
      value: 2,
      supporting_text: 'no purchase in quarter',
      filter_preset: { dormant_period: 'this_quarter' },
    },
    {
      id: 'overdue_receivables',
      label: 'Overdue receivables',
      value: 50000,
      entity_count: 2,
      document_count: 3,
      supporting_text: 'customers and invoices',
      filter_preset: { overdue: true },
    },
    {
      id: 'top80_customers',
      label: 'Top customers driving 80% of revenue',
      value: 4,
      supporting_text: 'customers in revenue concentration set',
      filter_preset: { sort: 'invoice_value_desc', cutoff: 'top80' },
    },
  ],
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'buyer-1',
    business_name: 'Credit Buyer',
    phone: '9876543210',
    is_active: true,
    buyer_app_enabled: true,
    invoice_value: 10000,
    invoice_count: 2,
    estimate_value: 3000,
    estimate_count: 1,
    order_value: 4000,
    order_count: 1,
    app_demand_value: 2500,
    app_demand_count: 3,
    receivable_amount: 9000,
    overdue_amount: 4500,
    credit_limit: 10000,
    credit_available: 1000,
    credit_used: 9000,
    ...overrides,
  };
}

describe('customers landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    setRouteStateMock.mockReset();
    useCustomersLandingMetricsMock.mockReset();
    useCustomersLandingInfiniteMock.mockReset();
    useFlagMock.mockReset();
    useFlagMock.mockReturnValue(true);
    useTenantSettingsMock.mockReset();
    useTenantSettingsMock.mockReturnValue({
      data: {
        modules: {
          orders: {
            features: {
              enquiries: true,
              sales_orders: true,
              invoices: true,
            },
          },
          buyer_app: {
            enabled: true,
          },
        },
      },
    });

    useCustomersLandingMetricsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: v4Metrics,
    });
    useCustomersLandingInfiniteMock.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      data: {
        pages: [{ buyers: [row()], nextCursor: null, total: 1 }],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  it('shows V4 active customers KPI', () => {
    render(<CustomersLandingClient initialData={null} />);

    expect(screen.getByText('Active Customers')).toBeInTheDocument();
    expect(screen.getByText('purchased at least once')).toBeInTheDocument();
  });

  it('applies KPI filter_preset on card click', () => {
    render(<CustomersLandingClient initialData={null} />);

    fireEvent.click(screen.getByText('Active Customers'));

    expect(setRouteStateMock).toHaveBeenCalled();
  });

  it('credit bar uses warning color above 75%', () => {
    const { container } = render(<CustomersLandingClient initialData={null} />);
    expect(container.querySelector('.bg-warning-500')).toBeTruthy();
  });

  it('renders amount and count supporting text for QTD columns', () => {
    render(<CustomersLandingClient initialData={null} />);

    expect(screen.getByText('Sales · QTD')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Estimate Value · QTD')).toBeInTheDocument();
    expect(screen.getByText('Estimates')).toBeInTheDocument();
    expect(screen.getByText('Order Value · QTD')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('App Demand · QTD')).toBeInTheDocument();
    expect(screen.getByText('App docs')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Buyer App enabled').length).toBeGreaterThan(0);
    expect(screen.queryByText('Buyer App enabled')).not.toBeInTheDocument();
    expect(screen.getAllByText('9876543210').length).toBeGreaterThan(0);
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Status: All')).toBeInTheDocument();
    expect(screen.getByText('Outstanding: All')).toBeInTheDocument();
    expect(screen.getByText('Buyer App: All')).toBeInTheDocument();
  });

  it('hides estimate and order columns when those modules are disabled', () => {
    useFlagMock.mockImplementation((flag: string) => {
      if (flag === 'ESTIMATES' || flag === 'SALES_ORDERS') return false;
      return true;
    });
    useTenantSettingsMock.mockReturnValue({
      data: {
        modules: {
          orders: {
            features: {
              enquiries: false,
              sales_orders: false,
              invoices: true,
            },
          },
          buyer_app: {
            enabled: true,
          },
        },
      },
    });

    render(<CustomersLandingClient initialData={null} />);

    expect(screen.getByText('Sales · QTD')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.queryByText('Estimate Value · QTD')).not.toBeInTheDocument();
    expect(screen.queryByText('Order Value · QTD')).not.toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
  });
});
