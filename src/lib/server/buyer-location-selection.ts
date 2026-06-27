import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { buildBuyerLocationHref } from '@/lib/buyer-routes';
import { DELIVERY_COOKIE_NAME, parseDeliveryCookie } from '@/lib/buyer-delivery-location';
import type { BuyerDeliveryLocation } from '@/lib/buyer-delivery-location';

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
