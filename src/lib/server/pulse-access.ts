import { NextResponse } from 'next/server';

import { ROLES } from '@/constants';
import { SELLER_ROUTES } from '@/lib/seller-routes';

/** Pulse is a seller_admin-only surface. Assistants (location-scoped) never see it. */
export function canAccessPulse(role: string | null | undefined): boolean {
  return role === ROLES.SELLER_ADMIN;
}

/** Where a signed-in seller lands by default; Pulse only for admins. */
export function sellerHomeRoute(role: string | null | undefined): string {
  return canAccessPulse(role) ? SELLER_ROUTES.pulse : SELLER_ROUTES.today;
}

export const PULSE_FORBIDDEN_CACHE_CONTROL = 'private, no-store';

/** 403 for non-admin callers of Pulse APIs — must run before any data access. */
export function pulseForbiddenResponse() {
  const response = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  response.headers.set('Cache-Control', PULSE_FORBIDDEN_CACHE_CONTROL);
  return response;
}
