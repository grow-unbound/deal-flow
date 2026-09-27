import { DELIVERY_COOKIE_NAME, parseDeliveryCookie } from '@/lib/buyer-delivery-location';

/**
 * Browser-only: the delivery warehouse the visitor selected, for guest twin URLs (`?wh=`).
 * Ignores a cookie stamped for a different tenant (the delivery cookie lives on a shared parent
 * domain, so a stale selection from another storefront must not leak into this one).
 */
export function readGuestDeliveryWarehouseId(): string | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  const match = document.cookie.split('; ').find((entry) => entry.startsWith(`${DELIVERY_COOKIE_NAME}=`));
  if (!match) return null;
  const payload = parseDeliveryCookie(match.slice(DELIVERY_COOKIE_NAME.length + 1));
  if (!payload) return null;
  const hostSlug = window.location.hostname.split('.')[0]?.toLowerCase();
  if (payload.tenant_slug && hostSlug && payload.tenant_slug.toLowerCase() !== hostSlug) return null;
  return payload.selected?.nearest_warehouse_id ?? null;
}
