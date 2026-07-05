import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useWarehousesLandingMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useSellerLandingPeriod', () => ({
  useSellerLandingPeriod: () => ({
    period: 'month',
    setPeriod: vi.fn(),
    horizonLabel: 'This month',
    options: [],
  }),
}));

vi.mock('@/hooks/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({
    state: {
      search: '',
      filters: { status: [], stock: [] },
      sortBy: 'Tracked SKUs (high → low)',
    },
    setState: vi.fn(),
  }),
  useRouteScrollRestoration: () => undefined,
}));

vi.mock('@/hooks/useWarehouses', () => ({
  useWarehousesLanding: () => useWarehousesLandingMock(),
}));

vi.mock('@/components/seller/warehouses/WarehouseFormSheet', () => ({
  WarehouseFormSheet: () => null,
}));

import { WarehousesLandingClient } from '@/components/seller/warehouses/WarehousesLandingClient';

describe('warehouses landing page', () => {
  it('renders KPI strip, callouts, and warehouse table', () => {
    useWarehousesLandingMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        kpis: {
          active_warehouses: 2,
          tracked_skus: 24,
          low_stock_warehouses: 1,
          idle_stock_skus: 3,
        },
        callouts: {
          stock_attention: [{ id: 'w1', name: 'Mumbai Central', initials: 'MC', city: 'Mumbai', value: 2 }],
          idle_stock: [{ id: 'w1', name: 'Mumbai Central', initials: 'MC', city: 'Mumbai', value: 3 }],
          recently_replenished: [{ id: 'w1', name: 'Mumbai Central', initials: 'MC', city: 'Mumbai', value: 12, last_updated: '2026-07-05T10:00:00.000Z' }],
        },
        warehouses: [
          {
            id: 'w1',
            name: 'Mumbai Central',
            initials: 'MC',
            city: 'Mumbai',
            state: 'MH',
            linked_location_name: 'Mumbai Branch',
            status: 'active',
            is_default: true,
            tracked_skus: 12,
            sellable_units: 110,
            low_stock_skus: 1,
            stockout_skus: 1,
            idle_stock_skus: 3,
            stock_status: 'low_stock',
            last_updated: '2026-07-05T10:00:00.000Z',
            associated_users_count: 2,
          },
        ],
        period: 'month',
        refreshed_at: '2026-07-05T10:00:00.000Z',
      },
    });

    render(<WarehousesLandingClient initialData={null} initialPeriod="month" />);

    expect(screen.getByText('Warehouses')).toBeInTheDocument();
    expect(screen.getByText('Active warehouses')).toBeInTheDocument();
    expect(screen.getByText('Stock attention')).toBeInTheDocument();
    expect(screen.getAllByText('Mumbai Central').length).toBeGreaterThan(0);
    expect(screen.getByText('Linked location')).toBeInTheDocument();
  });
});
