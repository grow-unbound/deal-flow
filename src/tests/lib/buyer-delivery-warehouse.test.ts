// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readGuestDeliveryWarehouseId } from '@/lib/buyer-delivery-warehouse';
import { DELIVERY_COOKIE_NAME, serializeDeliveryCookie } from '@/lib/buyer-delivery-location';

const WH = '4f1c2b7e-9d3a-4c11-8a55-0b6f3a9e1d20';

function setCookie(tenantSlug: string | undefined, warehouseId: string | null) {
  const value = serializeDeliveryCookie({
    selected: { place_id: 'p', label: 'l', formatted_address: 'a', lat: 1, lng: 2, nearest_warehouse_id: warehouseId },
    tenant_slug: tenantSlug,
  });
  document.cookie = `${DELIVERY_COOKIE_NAME}=${value}; path=/`;
}

afterEach(() => {
  document.cookie = `${DELIVERY_COOKIE_NAME}=; path=/; max-age=0`;
});

describe('readGuestDeliveryWarehouseId', () => {
  it('returns null with no cookie', () => {
    expect(readGuestDeliveryWarehouseId()).toBeNull();
  });

  it('returns the selected warehouse when the cookie has no tenant stamp or the same tenant', () => {
    setCookie(undefined, WH);
    expect(readGuestDeliveryWarehouseId()).toBe(WH);
    // jsdom default host is "localhost" -> slug "localhost"
    setCookie('localhost', WH);
    expect(readGuestDeliveryWarehouseId()).toBe(WH);
  });

  it('ignores a selection stamped for another tenant (shared parent-domain cookie)', () => {
    setCookie('some-other-tenant', WH);
    expect(readGuestDeliveryWarehouseId()).toBeNull();
  });

  it('returns null when the selection has no warehouse', () => {
    setCookie(undefined, null);
    expect(readGuestDeliveryWarehouseId()).toBeNull();
  });
});
