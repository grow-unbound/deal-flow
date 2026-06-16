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

export function buildSetCookieHeader(payload: BuyerDeliveryCookiePayload): string {
  const body = serializeDeliveryCookie(payload);
  return `${DELIVERY_COOKIE_NAME}=${body}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}
