import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { WarehouseDetailsTab } from '@/components/seller/warehouses/detail/WarehouseDetailsTab';

describe('WarehouseDetailsTab', () => {
  it('renders a consolidated address and mapped-location users', () => {
    render(
      <WarehouseDetailsTab
        data={{
          id: 'warehouse-1',
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
          linked_location: {
            id: 'loc-1',
            name: 'Mumbai Branch',
            is_default: true,
            associated_users: [
              { email: 'sara@example.com', user_name: 'Sara', user_id: 'user-1' },
            ],
          },
          address: { line1: 'Main road', line2: 'Sector 12', city: 'Mumbai', state: 'MH', pincode: '400001' },
          associated_users: [],
          created_at: '2026-07-01T10:00:00.000Z',
          updated_at: '2026-07-05T10:00:00.000Z',
          tracked_skus_count: 14,
          meta_strip: {
            tracked_skus: 14,
            sellable_units: 120,
            low_stock_skus: 3,
            idle_stock_skus: 2,
          },
          details: {
            associated_users_count: 1,
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
            inventory_trend: [],
            idle_stock: [],
            recent_replenishment: [],
          },
        } as never}
      />,
    );

    expect(screen.getByText('Main road, Sector 12, Mumbai MH, 400001')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
    expect(screen.getByText('Users associated with Mumbai Branch.')).toBeInTheDocument();
  });
});
