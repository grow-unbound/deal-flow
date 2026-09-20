import { NextRequest, NextResponse } from 'next/server';
import { hasNonPublicParams, toBuyerUpstreamPath } from '@/lib/guest-public-api';
import { GET as catalogGET } from '../../../buyer/catalog/route';
import { GET as brandsGET } from '../../../buyer/brands/route';
import { GET as categoriesGET } from '../../../buyer/categories/route';
import { GET as searchGET } from '../../../buyer/search/route';
import { GET as recommendationsGET } from '../../../buyer/recommendations/route';
import { GET as meGET } from '../../../buyer/me/route';
import { GET as homeRecoGET } from '../../../buyer/home/reco/route';
import { GET as productGET } from '../../../buyer/products/[id]/route';
import { GET as productFamilyGET } from '../../../buyer/product-families/[id]/route';
import { GET as recoCategoryGET } from '../../../buyer/reco/category/[id]/route';
import { GET as recoBrandGET } from '../../../buyer/reco/brand/[id]/route';

/**
 * GET /api/public/g/<path>  — guest-only, CDN-cacheable twin of the anonymous-safe /api/buyer/*
 * catalog reads (see src/lib/guest-public-api.ts).
 *
 * Safety model: a shared cache keyed on URL must never serve one visitor's response to another.
 * This handler therefore delegates to the existing /api/buyer/* handlers with a request rebuilt
 * from scratch: NO cookies, NO Authorization, NO preview/session `x-verified-*` identity headers.
 * The only inputs kept are the tenant and live-storefront headers that middleware derives from the
 * Host (deleted from the inbound request and re-set by middleware, never client-controlled). The
 * upstream handler therefore always resolves the GUEST view of the Host's tenant; anything else
 * (not live, unknown tenant) yields a non-200 which is never cached. Cache key = Host + path +
 * query, and the response never varies by anything else.
 */

type Params = { params: Promise<{ id: string }> };
type UpstreamHandler = (req: NextRequest, ctx: Params) => Promise<Response>;

const ROUTES: Array<{ re: RegExp; handler: UpstreamHandler; idGroup?: number; ttl: number }> = [
  { re: /^catalog$/, handler: catalogGET as UpstreamHandler, ttl: 60 },
  { re: /^brands$/, handler: brandsGET as UpstreamHandler, ttl: 120 },
  { re: /^categories$/, handler: categoriesGET as UpstreamHandler, ttl: 120 },
  { re: /^search$/, handler: searchGET as UpstreamHandler, ttl: 30 },
  { re: /^recommendations$/, handler: recommendationsGET as UpstreamHandler, ttl: 60 },
  { re: /^me$/, handler: meGET as UpstreamHandler, ttl: 60 },
  { re: /^home\/reco$/, handler: homeRecoGET as UpstreamHandler, ttl: 60 },
  { re: /^products\/([^/]+)$/, handler: productGET as UpstreamHandler, idGroup: 1, ttl: 60 },
  { re: /^product-families\/([^/]+)$/, handler: productFamilyGET as UpstreamHandler, idGroup: 1, ttl: 60 },
  { re: /^reco\/category\/([^/]+)$/, handler: recoCategoryGET as UpstreamHandler, idGroup: 1, ttl: 120 },
  { re: /^reco\/brand\/([^/]+)$/, handler: recoBrandGET as UpstreamHandler, idGroup: 1, ttl: 120 },
];

// Only what the guest view needs; everything else (cookie, authorization, x-verified-user-id,
// x-verified-buyer-id, preview token, ...) is dropped on purpose.
const FORWARDED_HEADERS = ['x-verified-tenant-id', 'x-verified-storefront-live', 'x-forwarded-for', 'x-real-ip', 'user-agent', 'accept', 'host'];

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

function sanitizedUpstreamRequest(request: NextRequest, upstreamPath: string): NextRequest {
  const url = new URL(request.url);
  url.pathname = upstreamPath;
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextRequest(url, { method: 'GET', headers });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const subPath = (path ?? []).join('/');
  const upstreamPath = toBuyerUpstreamPath(subPath);
  const route = upstreamPath ? ROUTES.find((r) => r.re.test(subPath)) : undefined;
  if (!upstreamPath || !route) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  const match = route.re.exec(subPath);
  const id = route.idGroup && match ? decodeURIComponent(match[route.idGroup]) : '';
  const upstreamRequest = sanitizedUpstreamRequest(request, upstreamPath);
  const upstream = await route.handler(upstreamRequest, { params: Promise.resolve({ id }) });

  const cacheable = upstream.status === 200 && !hasNonPublicParams(request.nextUrl.search);
  const headers = new Headers(upstream.headers);
  headers.delete('set-cookie');
  headers.set(
    'Cache-Control',
    cacheable
      ? `public, s-maxage=${route.ttl}, stale-while-revalidate=120`
      : NO_STORE['Cache-Control'],
  );
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
