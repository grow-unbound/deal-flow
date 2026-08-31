import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { buildBuyerLocationHref } from '@/lib/buyer-routes';
import { DELIVERY_COOKIE_NAME, parseDeliveryCookie } from '@/lib/buyer-delivery-location';
import type { BuyerDeliveryLocation } from '@/lib/buyer-delivery-location';

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

export async function requireBuyerDeliverySelection(returnTo: string): Promise<BuyerDeliveryLocation> {
  const selected = await getSelectedBuyerDeliveryFromCookies();
  if (!selected) {
    redirect(buildBuyerLocationHref(returnTo));
  }
  return selected;
}
