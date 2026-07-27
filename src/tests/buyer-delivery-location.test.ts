import { describe, expect, it } from 'vitest';
import {
  formatBuyerSelectedLocationLabel,
  parseDeliveryCookie,
  serializeDeliveryCookie,
  type BuyerDeliveryCookiePayload,
} from '@/lib/buyer-delivery-location';

describe('buyer delivery cookie routing metadata', () => {
  it('round-trips routed warehouse fields', () => {
    const payload: BuyerDeliveryCookiePayload = {
      selected: {
        place_id: 'place-1',
        label: 'Andheri West',
        formatted_address: 'Andheri West, Mumbai',
        city: 'Mumbai',
        state: 'MH',
        pincode: '400058',
        lat: 19.12,
        lng: 72.84,
        selection_source: 'maps',
        place_of_supply: 'Andheri West',
        nearest_warehouse_id: 'wh-1',
        routed_location_id: 'loc-1',
        routed_location_name: 'Mumbai Central Outlet',
        nearest_warehouse_name: 'Mumbai Warehouse',
        nearest_warehouse_distance_km: 4,
        nearest_warehouse_fallback: false,
      },
      recent: [],
    };

    expect(parseDeliveryCookie(serializeDeliveryCookie(payload))?.selected).toMatchObject({
      place_of_supply: 'Andheri West',
      nearest_warehouse_id: 'wh-1',
      routed_location_id: 'loc-1',
      routed_location_name: 'Mumbai Central Outlet',
      nearest_warehouse_name: 'Mumbai Warehouse',
      nearest_warehouse_distance_km: 4,
      nearest_warehouse_fallback: false,
    });
  });

  it('keeps old location cookies valid', () => {
    const oldPayload = {
      selected: {
        place_id: 'place-old',
        label: 'Bandra',
        formatted_address: 'Bandra, Mumbai',
        city: 'Mumbai',
        lat: 19.06,
        lng: 72.83,
      },
      recent: [],
    };

    const parsed = parseDeliveryCookie(encodeURIComponent(JSON.stringify(oldPayload)));

    expect(parsed?.selected?.label).toBe('Bandra');
    expect(parsed?.selected?.nearest_warehouse_id).toBeUndefined();
  });

  it('prefers routed outlet name when formatting the selected label', () => {
    expect(
      formatBuyerSelectedLocationLabel({
        label: 'Andheri West',
        city: 'Mumbai',
        routed_location_name: 'Mumbai Central Outlet',
      }),
    ).toBe('Mumbai Central Outlet');
  });
});
