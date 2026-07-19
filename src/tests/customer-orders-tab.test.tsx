import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useCustomerDocumentsMock = vi.fn();
const useDebounceMock = vi.fn();
const useFlagStateMock = vi.fn();
const useRouteSnapshotMock = vi.fn();
const useSellerLandingPeriodMock = vi.fn();
const useRouterMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => useRouterMock(),
}));

vi.mock('@/hooks/useCustomersLanding', () => ({
  useCustomerDocuments: (...args: unknown[]) => useCustomerDocumentsMock(...args),
}));

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (...args: unknown[]) => useDebounceMock(...args),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (...args: unknown[]) => useFlagStateMock(...args),
}));

vi.mock('@/hooks/useRouteSnapshot', () => ({
  useRouteSnapshot: (...args: unknown[]) => useRouteSnapshotMock(...args),
}));

vi.mock('@/hooks/useSellerLandingPeriod', () => ({
  useSellerLandingPeriod: (...args: unknown[]) => useSellerLandingPeriodMock(...args),
}));

vi.mock('@/components/seller/transactional', () => ({
  TransactionTable: ({ rows }: { rows: unknown[] }) => <div>Rows: {rows.length}</div>,
}));

vi.mock('@/components/ui/empty-state', () => ({
  EmptyState: ({ heading }: { heading: string }) => <div>{heading}</div>,
}));

vi.mock('@/components/seller/layout', async () => {
  const actual = await vi.importActual<typeof import('@/components/seller/layout')>('@/components/seller/layout');
  return {
    ...actual,
    FilterBar: ({ groups }: { groups?: Array<{ values: string[] }> }) => (
      <div>{groups?.[0]?.values?.[0] ?? 'no-period'}</div>
    ),
  };
});

import { CustomerOrdersTab } from '@/components/seller/customers/detail/CustomerOrdersTab';

describe('CustomerOrdersTab', () => {
  beforeEach(() => {
    useRouterMock.mockReset();
    useCustomerDocumentsMock.mockReset();
    useDebounceMock.mockReset();
    useFlagStateMock.mockReset();
    useRouteSnapshotMock.mockReset();
    useSellerLandingPeriodMock.mockReset();

    useRouterMock.mockReturnValue({ push: vi.fn() });
    useDebounceMock.mockImplementation((value: unknown) => value);
    useFlagStateMock.mockReturnValue(false);
    useRouteSnapshotMock.mockImplementation(({ initialState }: { initialState: unknown }) => ({
      state: initialState,
      setState: vi.fn(),
    }));
    useSellerLandingPeriodMock.mockImplementation((initialPeriod: string) => ({
      period: initialPeriod,
      setPeriod: vi.fn(),
      options: [{ value: 'last90', label: 'Trailing 90 days' }],
      horizonLabel: 'Trailing 90 days',
      lowerLabel: 'in the last 90 days',
      metricSuffix: '90D',
    }));
    useCustomerDocumentsMock.mockReturnValue({
      data: { rows: [], total: 0, limit: 200, offset: 0 },
      isLoading: false,
      isFetching: false,
    });
  });

  it('defaults customer document tabs to trailing 90 days and requests last90 data', () => {
    render(
      <CustomerOrdersTab
        buyerId="buyer-1"
        buyerName="Singh Hospitality"
        kind="order"
        routeBase="/sales-orders"
      />,
    );

    expect(useSellerLandingPeriodMock).toHaveBeenCalledWith('last90');
    expect(useCustomerDocumentsMock).toHaveBeenCalledWith(
      'buyer-1',
      expect.objectContaining({
        kind: 'order',
        period: 'last90',
      }),
    );
    expect(screen.getByText('last90')).toBeInTheDocument();
  });
});
