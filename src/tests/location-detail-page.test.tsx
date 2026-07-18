import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useLocationDetailMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useLocations', () => ({
  useLocationDetail: () => useLocationDetailMock(),
}));

vi.mock('@/hooks/useTenantLocations', () => ({
  useTenantLocations: () => ({ data: { locations: [] } }),
}));

vi.mock('@/hooks/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({ state: 'performance', setState: vi.fn() }),
}));

vi.mock('@/components/seller/settings/LocationFormSheet', () => ({
  LocationFormSheet: () => null,
}));

import { LocationDetailPage } from '@/components/seller/locations/detail/LocationDetailPage';

describe('location detail page', () => {
  it('renames the overview tab to performance', () => {
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
          gmv_mtd: 120000,
          growth_pct: 15,
          active_buyers: 10,
          total_buyers: 18,
          outstanding_dues: 0,
          invoice_count: 0,
          low_stock_skus: 2,
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

    expect(screen.getByRole('tab', { name: 'Performance' })).toHaveClass('border-ember-500');
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument();
    expect(screen.getByText('Revenue trend')).toBeInTheDocument();
  });
});
