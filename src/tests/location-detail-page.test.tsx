import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useLocationDetailMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useLocations', () => ({
  useLocationDetail: () => useLocationDetailMock(),
}));

vi.mock('@/hooks/useTenantLocations', () => ({
  useTenantLocations: () => ({ data: { locations: [] } }),
}));

vi.mock('@/hooks/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({ state: 'orders', setState: vi.fn() }),
}));

vi.mock('@/components/seller/settings/LocationFormSheet', () => ({
  LocationFormSheet: () => null,
}));

import { LocationDetailPage } from '@/components/seller/locations/detail/LocationDetailPage';

describe('location detail page', () => {
  it('hides performance and defaults to orders', () => {
    useLocationDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        id: 'loc-1',
        name: 'Mumbai East',
        initials: 'ME',
        hue: 'teal',
        status: 'active',
        is_active: true,
        city: 'Mumbai',
        type: 'Warehouse',
        phone_number: '9999999999',
        associated_users: [],
        tab_badges: {
          customers: 3,
          orders_mtd: 4,
          low_stock_skus: 2,
        },
        meta_strip: {
          sales_qtd_value: 120000,
          sales_qtd_count: 8,
          sales_qtd_buyer_count: 10,
          demand_qtd_value: 140000,
          demand_qtd_count: 12,
          demand_qtd_buyer_count: 11,
          overdue_amount: 0,
          overdue_invoice_count: 0,
          invoice_count: 0,
          unpaid_invoice_count: 0,
          total_invoice_count: 0,
          open_estimate_count: 0,
          total_estimate_count: 0,
          open_primary_demand_kind: 'none',
          open_primary_demand_value: 0,
          open_primary_demand_count: 0,
        },
        overview: {
          gmv_trend: [],
          inventory_health: {
            active_skus: 12,
            oos_skus: 1,
            low_stock_skus: 2,
            avg_days_cover: 8,
          },
          top_buyers: [],
        },
        customers: [],
        orders: [],
        inventory: [],
        activity: [],
      },
    });

    render(<LocationDetailPage id="loc-1" />);

    expect(screen.queryByRole('tab', { name: 'Performance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Activity/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Orders/i })).toHaveClass('border-ember-500');
  });
});
