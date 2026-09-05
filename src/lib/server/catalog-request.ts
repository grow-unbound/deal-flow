import type { NextRequest } from 'next/server';
import { parseRequestHost } from '@/lib/storefront-host';

/** True when the request is on catalog.useyukti.in (or catalog.localhost). */
export function isCatalogRequest(request: NextRequest): boolean {
  const subdomain = request.headers.get('x-tenant-subdomain');
  if (subdomain === 'catalog') return true;
  const hostKind = parseRequestHost(request.headers.get('host') ?? '');
  return hostKind.kind === 'reserved' && hostKind.label === 'catalog';
}
