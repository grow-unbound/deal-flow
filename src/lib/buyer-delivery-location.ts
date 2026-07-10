import { z } from 'zod';

export const DELIVERY_COOKIE_NAME = 'df_buyer_delivery_v1';

export const buyerDeliveryLocationSchema = z.object({
  place_id: z.string(),
  label: z.string(),
  formatted_address: z.string(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  place_of_supply: z.string().optional(),
  nearest_warehouse_id: z.string().nullable().optional(),
  routed_location_id: z.string().nullable().optional(),
  nearest_warehouse_name: z.string().nullable().optional(),
  nearest_warehouse_distance_km: z.number().nullable().optional(),
  nearest_warehouse_fallback: z.boolean().optional(),
});

export type BuyerDeliveryLocation = z.infer<typeof buyerDeliveryLocationSchema>;

export const buyerDeliveryCookieSchema = z.object({
  selected: buyerDeliveryLocationSchema.nullable().optional(),
  recent: z.array(buyerDeliveryLocationSchema).max(5).optional(),
});

export type BuyerDeliveryCookiePayload = z.infer<typeof buyerDeliveryCookieSchema>;

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function serializeDeliveryCookie(payload: BuyerDeliveryCookiePayload): string {
  return encodeURIComponent(JSON.stringify(payload));
}

export function parseDeliveryCookie(raw: string | undefined | null): BuyerDeliveryCookiePayload | null {
  if (!raw?.trim()) return null;
  try {
    const decoded = raw.includes('%') ? decodeURIComponent(raw) : raw;
    const parsed = JSON.parse(decoded) as unknown;
    const r = buyerDeliveryCookieSchema.safeParse(parsed);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function pushRecentLocation(
  payload: BuyerDeliveryCookiePayload,
  loc: BuyerDeliveryLocation,
): BuyerDeliveryCookiePayload {
  const without = (payload.recent ?? []).filter((r) => r.place_id !== loc.place_id);
  const recent = [loc, ...without].slice(0, 5);
  return { ...payload, recent };
}

function trimText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Buyer catalog/cart headers need a short label that fits narrow mobile widths.
 * We prefer the picked sublocality-style label, then city, then a generic prompt.
 */
export function formatBuyerSelectedLocationLabel(
  location: Pick<BuyerDeliveryLocation, 'label' | 'city'> | null | undefined,
  fallback = 'Select location',
): string {
  return trimText(location?.label) || trimText(location?.city) || fallback;
}

/** Compact label for tight header slots — locality or city, never the full formatted address. */
export function formatBuyerCompactLocationLabel(
  location: Pick<BuyerDeliveryLocation, 'label' | 'city'> | null | undefined,
  fallback = 'Select location',
): string {
  if (!location) return fallback;

  const city = trimText(location.city);
  const label = trimText(location.label);
  const primary = label.split(',')[0]?.trim() ?? '';

  if (primary.length > 0 && primary.length <= 24) return primary;
  if (city) return city;
  if (primary.length > 0) {
    return primary.length > 26 ? `${primary.slice(0, 24)}…` : primary;
  }
  return fallback;
}

export function buildSetCookieHeader(payload: BuyerDeliveryCookiePayload): string {
  const body = serializeDeliveryCookie(payload);
  return `${DELIVERY_COOKIE_NAME}=${body}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}
