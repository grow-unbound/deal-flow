import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const useCustomersLandingMock = vi.fn();
const useCustomersLandingInfiniteMock = vi.fn();
const useRouteSnapshotMock = vi.fn();
const useRetainedValueMock = vi.fn();
const useDebounceMock = vi.fn();
const useInfiniteScrollMock = vi.fn();
const useRouteScrollRestorationMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/FeatureGate', () => ({
  FeatureGate: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/seller/customers/AddCustomerDialog', () => ({
  AddCustomerDialog: ({ open }: { open: boolean }) => (open ? <div>Add buyer form</div> : null),
}));

vi.mock('@/hooks/useCustomersLanding', () => ({
  useCustomersLanding: (...args: unknown[]) => useCustomersLandingMock(...args),
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
}));

// WhatsApp Broadcast (Phase E) — out of scope for this test suite, which
// doesn't provide an AuthContext/QueryClient wrapper. Keep the flag off so
// neither the composer sheet nor the history section mount.
vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: () => false,
  useFlagState: () => false,
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

describe('customers landing client', () => {
  beforeEach(() => {
    useCustomersLandingMock.mockReset();
    useCustomersLandingInfiniteMock.mockReset();
    useRouteSnapshotMock.mockReset();
    useRetainedValueMock.mockReset();
    useDebounceMock.mockReset();
    useInfiniteScrollMock.mockReset();
    useRouteScrollRestorationMock.mockReset();

    useCustomersLandingMock.mockReturnValue({
      data: {
        kpis: {
          total: 0,
          cohort_count: 0,
          active: 0,
          active_pct: 0,
          spend_mtd: 0,
          spend_growth_pct: 0,
          dormant_over_30d: 0,
          outstanding_dues: 0,
          buyers_with_dues: 0,
        },
        callouts: {
          needs_call: [],
          top_spenders: [],
          top_risers: [],
        },
        buyers: [],
        filters: { groups: [] },
      },
    });
    useCustomersLandingInfiniteMock.mockReturnValue({
      data: { pages: [] },
      isLoading: false,
      isError: false,
      isFetching: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    useRouteSnapshotMock.mockReturnValue({
      state: {
        filters: { status: [], due: [] },
        sortBy: 'Spend (high → low)',
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

  it('shows full callout counts and the complete overlay list', async () => {
    useCustomersLandingMock.mockReturnValue({
      data: {
        kpis: {
          total: 4,
          cohort_count: 0,
          active: 4,
          active_pct: 100,
          spend_mtd: 0,
          spend_growth_pct: 0,
          dormant_over_30d: 0,
          outstanding_dues: 0,
          buyers_with_dues: 0,
          invoiced_customer_count: 0,
          overdue_sum: 0,
          overdue_customer_count: 0,
          dormant_prior_year_value: 0,
        },
        callouts: {
          needs_call: [
            {
              id: 'buyer-1',
              business_name: 'Acme Retail',
              invoice_count: 2,
              days_overdue: 14,
              dues: 12000,
              avatar: { initials: 'AR', hue: 'teal' },
            },
            {
              id: 'buyer-2',
              business_name: 'Beacon Stores',
              invoice_count: 1,
              days_overdue: 9,
              dues: 8000,
              avatar: { initials: 'BS', hue: 'ember' },
            },
            {
              id: 'buyer-3',
              business_name: 'Cedar Mart',
              invoice_count: 3,
              days_overdue: 21,
              dues: 15000,
              avatar: { initials: 'CM', hue: 'cream' },
            },
            {
              id: 'buyer-4',
              business_name: 'Delta Traders',
              invoice_count: 2,
              days_overdue: 5,
              dues: 6000,
              avatar: { initials: 'DT', hue: 'teal' },
            },
          ],
          win_back: [],
        },
        buyers: [],
        filters: { groups: [] },
      },
    });

    render(<CustomersLandingClient initialData={null} />);

    const button = screen.getByRole('button', { name: /open full collect overdue balances list/i });
    expect(button).toHaveTextContent('4');
    expect(screen.queryByText('Cedar Mart')).not.toBeInTheDocument();
    expect(screen.queryByText('Delta Traders')).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(await screen.findByText('4 items')).toBeInTheDocument();
    expect(screen.getByText('Cedar Mart')).toBeInTheDocument();
    expect(screen.getByText('Delta Traders')).toBeInTheDocument();
  });
});
