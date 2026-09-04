import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { buildBuyerLocationHref } from '@/lib/buyer-routes';
import { DELIVERY_COOKIE_NAME, parseDeliveryCookie } from '@/lib/buyer-delivery-location';
import type { BuyerDeliveryLocation } from '@/lib/buyer-delivery-location';
import { getBuyerServerClaims } from '@/lib/server/buyer-server-claims';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

/**
 * The delivery cookie is set on the shared shop.dealflow.in host and is not
 * tenant-scoped, so a buyer who has shopped with more than one distributor on
 * the same device can carry a routed_location_id that belongs to a different
 * tenant than the one they're transacting with right now. Using it as-is trips
 * the app.metrics_mark_dirty tenant-mismatch guard as a 500 at insert time —
 * validate it against the current tenant first so we can ask the buyer to
 * reselect instead of crashing.
 */
export async function resolveTenantScopedLocationId(
  db: DbClient,
  tenantId: string,
  routedLocationId: string | null,
): Promise<string | null> {
  if (!routedLocationId) return null;
  const { data } = await db
    .schema('app')
    .from('locations')
    .select('id')
    .eq('id', routedLocationId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ? routedLocationId : null;
}

export async function getSelectedBuyerDeliveryFromCookies(): Promise<BuyerDeliveryLocation | null> {
  const cookieStore = await cookies();
  return parseDeliveryCookie(cookieStore.get(DELIVERY_COOKIE_NAME)?.value)?.selected ?? null;
}

export function getSelectedBuyerDeliveryFromRequest(req: NextRequest): BuyerDeliveryLocation | null {
  return parseDeliveryCookie(req.cookies.get(DELIVERY_COOKIE_NAME)?.value)?.selected ?? null;
}

/**
 * Guests have no outlet to route delivery to (that list is resolved off the
 * authenticated buyer's account) — the redirect would strand them on an
 * empty picker. Only an authenticated buyer session is required to select
 * a location before browsing; a guest passes through with `selected: null`.
 */
export async function requireBuyerDeliverySelection(returnTo: string): Promise<BuyerDeliveryLocation | null> {
  const claims = await getBuyerServerClaims();
  const selected = await getSelectedBuyerDeliveryFromCookies();
  if (!claims.buyer_id) return selected;
  if (!selected) {
    redirect(buildBuyerLocationHref(returnTo));
  }
  return selected;
}
