import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELIVERY_COOKIE_NAME, serializeDeliveryCookie } from '@/lib/buyer-delivery-location';
import { resolveBuyerInventoryWarehouseId } from '@/lib/server/buyer-product-data';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {},
  supabase: {},
}));

describe('buyer inventory warehouse resolution', () => {
  it('prefers selected delivery nearest_warehouse_id over buyer geography fallback', async () => {
    const req = new NextRequest('http://localhost/api/buyer/catalog', {
      headers: {
        cookie: `${DELIVERY_COOKIE_NAME}=${serializeDeliveryCookie({
          selected: {
            place_id: 'place-1',
            label: 'Andheri West',
            formatted_address: 'Andheri West, Mumbai',
            city: 'Mumbai',
            lat: 19.12,
            lng: 72.84,
            nearest_warehouse_id: 'wh-selected',
            routed_location_id: 'loc-selected',
          },
          recent: [],
        })}`,
      },
    });
    const db = { schema: vi.fn(() => { throw new Error('db should not be queried'); }) };

    await expect(resolveBuyerInventoryWarehouseId(db as any, req, {
      context: { tenant_id: 'tenant-1' },
      buyer: { id: 'buyer-1', geography: { city: 'Mumbai' } },
    } as any)).resolves.toBe('wh-selected');
    expect(db.schema).not.toHaveBeenCalled();
  });
});
