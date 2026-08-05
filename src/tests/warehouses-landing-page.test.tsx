import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useWarehousesLandingMock = vi.fn();
const useWarehousesLandingMetricsMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/warehouses',
  useSearchParams: () => new URLSearchParams(),
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
  useSeedRouteSearch: () => undefined,
}));

vi.mock('@/hooks/useWarehouses', () => ({
  useWarehousesLanding: () => useWarehousesLandingMock(),
  useWarehousesLandingMetrics: () => useWarehousesLandingMetricsMock(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ currentTenantId: 'tenant-1' }),
}));

vi.mock('@/components/seller/warehouses/WarehouseFormSheet', () => ({
  WarehouseFormSheet: () => null,
}));

import { WarehousesLandingClient } from '@/components/seller/warehouses/WarehousesLandingClient';

describe('warehouses landing page', () => {
  it('renders V4 KPI strip and warehouse table', () => {
    useWarehousesLandingMetricsMock.mockReturnValue({
      data: {
        page_key: 'warehouses',
        period: {
          period_key: 'this_quarter',
          grain: 'quarter',
          period_start: '2026-07-01',
          period_end_exclusive: '2026-10-01',
          label: 'This Quarter',
        },
        computed_at: '2026-07-05T10:00:00.000Z',
        source_watermark: '2026-07-05T10:00:00.000Z',
        cards: [
          {
            id: 'sellable_units',
            label: 'Sellable Units in stock',
            value: 110,
            supporting_text: 'products in warehouses',
            filter_preset: { stock: 'sellable' },
          },
          {
            id: 'no_sales',
            label: 'No sales in period',
            value: 1,
            supporting_text: 'stocked warehouses with no QTD sale',
            filter_preset: { not_sold_period: 'this_quarter', stock_gt: 0 },
          },
        ],
      },
    });
    useWarehousesLandingMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: {
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
            sold_sku_count: 4,
            sold_units: 22,
            invoice_value: 45000,
          },
        ],
        total: 1,
        filters: {
          groups: [
            { key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'dormant', label: 'Dormant' }] },
            { key: 'stock', label: 'Stock', options: [{ value: 'low_stock', label: 'Low Stock' }] },
          ],
        },
        period_key: 'this_quarter',
        grain: 'quarter',
        period: 'today',
        refreshed_at: '2026-07-05T10:00:00.000Z',
      },
    });

    render(<WarehousesLandingClient initialMetrics={null} />);

    expect(screen.getByText('Warehouses')).toBeInTheDocument();
    expect(screen.getByText('Sellable Units in stock')).toBeInTheDocument();
    expect(screen.getByText('No sales in period')).toBeInTheDocument();
    expect(screen.getAllByText('Mumbai Central').length).toBeGreaterThan(0);
    expect(screen.getByText('Linked location')).toBeInTheDocument();
    expect(screen.getByText('Sold units')).toBeInTheDocument();
  });
});
