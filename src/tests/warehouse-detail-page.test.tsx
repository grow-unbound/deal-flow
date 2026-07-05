import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useWarehouseDetailMock = vi.fn();
const useWarehouseReferenceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useWarehouses', () => ({
  useWarehouseDetail: () => useWarehouseDetailMock(),
  useWarehouseReference: () => useWarehouseReferenceMock(),
}));

vi.mock('@/hooks/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({ state: 'details', setState: vi.fn() }),
}));

vi.mock('@/components/seller/warehouses/WarehouseFormSheet', () => ({
  WarehouseFormSheet: () => null,
}));

import { WarehouseDetailPage } from '@/components/seller/warehouses/detail/WarehouseDetailPage';

describe('warehouse detail page', () => {
  it('renders the standard details tabs and edit CTA', () => {
    useWarehouseReferenceMock.mockReturnValue({ data: null });
    useWarehouseDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        id: '8b19a144-55b0-4e46-bd87-0979e6d1df51',
        name: 'Mumbai Central Warehouse',
        initials: 'MC',
        status: 'active',
        is_default: true,
        city: 'Mumbai',
        state: 'MH',
        phone_number: '9999999999',
        external_ref: 'WH-001',
        lat: null,
        lng: null,
        linked_location: { id: 'loc-1', name: 'Mumbai Branch', is_default: true },
        address: { line1: 'Main road', line2: '', city: 'Mumbai', state: 'MH', pincode: '400001' },
        associated_users: [],
        created_at: '2026-07-01T10:00:00.000Z',
        updated_at: '2026-07-05T10:00:00.000Z',
        meta_strip: {
          tracked_skus: 14,
          sellable_units: 120,
          low_stock_skus: 3,
          idle_stock_skus: 2,
        },
        details: {
          associated_users_count: 0,
          stockout_skus: 1,
          reorder_triggered_skus: 3,
          last_inventory_update: '2026-07-05T10:00:00.000Z',
        },
        performance: {
          inventory_health: {
            active_skus: 14,
            low_stock_skus: 2,
            stockout_skus: 1,
            avg_sellable_per_sku: 9,
          },
          stock_posture: {
            sellable_units: 120,
            reorder_triggered_skus: 3,
            is_default: true,
            linked_location_name: 'Mumbai Branch',
          },
          idle_stock: [],
          recent_replenishment: [],
        },
        stock: [],
      },
    });

    render(<WarehouseDetailPage id="8b19a144-55b0-4e46-bd87-0979e6d1df51" />);

    expect(screen.getByRole('button', { name: 'Details' })).toHaveClass('border-teal-500');
    expect(screen.getByRole('button', { name: 'Performance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stock/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit warehouse' })).toBeInTheDocument();
    expect(screen.getByText('Warehouse details')).toBeInTheDocument();
  });
});
