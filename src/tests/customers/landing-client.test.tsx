import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const useCustomersLandingMetricsMock = vi.fn();
const useCustomersLandingInfiniteMock = vi.fn();
const useRouteSnapshotMock = vi.fn();
const useRetainedValueMock = vi.fn();
const useDebounceMock = vi.fn();
const useInfiniteScrollMock = vi.fn();
const useRouteScrollRestorationMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/customers',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/FeatureGate', () => ({
  FeatureGate: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/seller/customers/AddCustomerDialog', () => ({
  AddCustomerDialog: ({ open }: { open: boolean }) => (open ? <div>Add buyer form</div> : null),
}));

vi.mock('@/hooks/useCustomersLanding', () => ({
  useCustomersLandingMetrics: (...args: unknown[]) => useCustomersLandingMetricsMock(...args),
  useCustomersLanding: (...args: unknown[]) => useCustomersLandingMetricsMock(...args),
  useCustomersLandingInfinite: (...args: unknown[]) => useCustomersLandingInfiniteMock(...args),
}));

vi.mock('@/hooks/useRouteSnapshot', () => ({
  useRouteSnapshot: (...args: unknown[]) => useRouteSnapshotMock(...args),
  useSeedRouteSearch: () => undefined,
  useRouteScrollRestoration: (...args: unknown[]) => useRouteScrollRestorationMock(...args),
}));

vi.mock('@/hooks/useRetainedValue', () => ({
  useRetainedValue: (...args: unknown[]) => useRetainedValueMock(...args),
}));

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (...args: unknown[]) => useDebounceMock(...args),
}));

vi.mock('@/hooks/useInfiniteScroll', () => ({
  useInfiniteScroll: (...args: unknown[]) => useInfiniteScrollMock(...args),
  getSentinelInsertIndex: () => -1,
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: () => false,
  useFlagState: () => true,
}));
vi.mock('@/hooks/useTenantSettings', () => ({
  useTenantSettings: () => ({
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
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    tenantProfile: { role: 'seller_admin' },
    currentTenantId: 'tenant-1',
  }),
}));
vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ isSellerAssistant: false, isSellerAdmin: true }),
}));
vi.mock('@/components/seller/customers/BroadcastComposerSheet', () => ({
  BroadcastComposerSheet: () => null,
}));
vi.mock('@/components/seller/customers/BroadcastHistorySection', () => ({
  BroadcastHistorySection: () => null,
}));

import { CustomersLandingClient } from '@/components/seller/customers/CustomersLandingClient';

const emptyMetrics = {
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
      value: 12,
      supporting_text: 'purchased at least once',
      filter_preset: { purchased_gte: 1, period: 'this_quarter' },
    },
  ],
};

describe('customers landing client', () => {
  beforeEach(() => {
    useCustomersLandingMetricsMock.mockReset();
    useCustomersLandingInfiniteMock.mockReset();
    useRouteSnapshotMock.mockReset();
    useRetainedValueMock.mockReset();
    useDebounceMock.mockReset();
    useInfiniteScrollMock.mockReset();
    useRouteScrollRestorationMock.mockReset();

    useCustomersLandingMetricsMock.mockReturnValue({
      data: emptyMetrics,
      isLoading: false,
      isError: false,
    });
    useCustomersLandingInfiniteMock.mockReturnValue({
      data: { pages: [{ buyers: [], nextCursor: null, total: 0 }] },
      isLoading: false,
      isError: false,
      isFetching: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    useRouteSnapshotMock.mockReturnValue({
      state: {
        filters: { filter_preset: null, selected_kpi_id: null },
        sortBy: 'Sales (high → low)',
        search: '',
      },
      setState: vi.fn(),
    });
    useRetainedValueMock.mockImplementation((value: unknown) => value);
    useDebounceMock.mockImplementation((value: unknown) => value);
    useInfiniteScrollMock.mockReturnValue({ sentinelRef: { current: null } });
    useRouteScrollRestorationMock.mockImplementation(() => undefined);
  });

  it('shows the add buyer button and opens the form', () => {
    render(<CustomersLandingClient initialData={null} />);

    fireEvent.click(screen.getByRole('button', { name: /add a buyer/i }));

    expect(screen.getByText('Add buyer form')).toBeInTheDocument();
  });

  it('renders V4 KPI cards from metrics snapshot', () => {
    render(<CustomersLandingClient initialData={null} />);

    expect(screen.getByText('Active Customers')).toBeInTheDocument();
    expect(screen.getByText('purchased at least once')).toBeInTheDocument();
  });
});
