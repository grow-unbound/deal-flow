import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { decodeJWTPayload } from '@/lib/auth';
import {
  TENANT_FLAGS_COOKIE,
  TENANT_FLAGS_HEADER,
  TENANT_FLAGS_TTL_SECONDS,
  createTenantFlagsToken,
  encodeTenantFlagsHeader,
  verifyTenantFlagsToken,
  type TenantCreateFlags,
} from '@/lib/server/tenant-flags-token';
import type { Database } from '@/types/database';

// Routes that don't require an authenticated session
const PUBLIC_PREFIXES = [
  '/api/auth',
  '/auth',
  '/login',
  '/verify',
  '/verify-account',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/setup-password',
  '/_next',
  '/favicon.ico',
  '/brand', // Static brand assets (logo SVGs etc) — must be public for auth pages
  '/ingest', // PostHog analytics proxy — must be public so rewrites can forward it
  '/api/debug', // Diagnostic endpoint — remove from PUBLIC_PREFIXES before going to production
  '/manifest.webmanifest', // PWA manifest — browsers fetch it unauthenticated
  '/buyer-sw.js', // PWA service worker — must be reachable before any buyer session exists
];

// NOTE: the matcher's extension-based exclusions below (e.g. `\.js`) only match paths
// that literally start with those strings, not paths ending in them — regex negative
// lookaheads anchor at the start of the remaining path. Root-level static files (like
// /buyer-sw.js) still reach this middleware and must be listed explicitly above.
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function extractSubdomain(hostname: string): string | null {
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    return null;
  }
  const parts = hostname.split('.');
  return parts.length > 2 ? parts[0] : null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') ?? '';
  const requestHeaders = new Headers(request.headers);
  const subdomain = extractSubdomain(hostname);
  requestHeaders.set('x-tenant-subdomain', subdomain ?? '');
  let res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('x-tenant-subdomain', subdomain ?? '');

  // When Supabase can't match the full redirectTo URL against its allowlist it strips
  // the path and appends ?code= to the site root. Forward those codes to the real
  // callback handler so the PKCE exchange still completes correctly.
  if (pathname === '/' && request.nextUrl.searchParams.has('code')) {
    const callbackUrl = new URL('/api/auth/callback', request.url);
    callbackUrl.searchParams.set('code', request.nextUrl.searchParams.get('code')!);
    return NextResponse.redirect(callbackUrl);
  }

  if (isPublicRoute(pathname)) {
    return res;
  }

  // Validate session via Supabase (reads cookies, refreshes if needed)
  const supabase = createMiddlewareClient<Database>({ req: request, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname + (request.nextUrl.search || ''));
    return NextResponse.redirect(loginUrl);
  }

  // Decode JWT payload to extract custom claims set by custom_access_token_hook.
  // getSession() already validated the token cryptographically via Supabase.
  let tenantId: string | null = null;
  let role: string | null = null;
  let buyerId: string | null = null;
  let locationIds: string[] | null = null;

  try {
    const payload = decodeJWTPayload(session.access_token);
    tenantId = (payload.tenant_id as string) ?? null;
    // Application role is stored under "user_role" post-migration.
    // Fall back to "role" for sessions issued before the JWT hook was updated
    // (fix_jwt_role_claim_collision migration); they auto-heal on token refresh.
    role = (payload.user_role as string) ?? (payload.role as string) ?? null;
    buyerId = (payload.buyer_id as string) ?? null;
    locationIds = Array.isArray(payload.location_ids)
      ? payload.location_ids.filter((value): value is string => typeof value === 'string')
      : null;
  } catch {
    // Malformed token — treat as expired
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Forward verified claims as headers; server components read these instead
  // of trusting any client-supplied tenant_id values.
  if (tenantId) requestHeaders.set('x-verified-tenant-id', tenantId);
  if (role) requestHeaders.set('x-verified-role', role);
  if (buyerId) requestHeaders.set('x-verified-buyer-id', buyerId);
  if (locationIds) requestHeaders.set('x-verified-location-ids', JSON.stringify(locationIds));
  if (session.user?.id) requestHeaders.set('x-verified-user-id', session.user.id);

  // Forward buyer preview cookie as a trusted server-side header.
  // Cookie is httpOnly and HMAC-signed — getBuyerAppContext verifies the signature.
  const buyerPreviewCookie = request.cookies.get('buyer_preview')?.value;
  if (buyerPreviewCookie) {
    requestHeaders.set('x-buyer-preview', buyerPreviewCookie);
  }

  // Resolve tenant feature flags once per (long) session instead of per navigation.
  // Cookie is httpOnly + HMAC-signed (df_flags) so a tampered/edited cookie is
  // rejected and falls back to a fresh resolve — never trusted blindly, since these
  // flags gate paid-tier features. The fresh resolve calls posthog-node, which is
  // NOT Edge-Runtime compatible (middleware only runs on Edge) — so instead of
  // calling resolveTenantFlags() directly, self-fetch a Node-runtime Route Handler
  // that does, same pattern as fetchSellerPageBootstrap.
  let freshTenantFlags: { flags: Record<string, boolean>; createFlags: TenantCreateFlags } | null = null;
  // Skip for the flags-refresh route itself — its self-fetch re-enters this same
  // middleware, and now that cookies are forwarded to it, resolving flags for that
  // inner request too would recurse into another self-fetch indefinitely.
  if (tenantId && role?.startsWith('seller_') && pathname !== '/api/tenant/flags-refresh') {
    const flagsCookie = request.cookies.get(TENANT_FLAGS_COOKIE)?.value;
    const verified = flagsCookie ? await verifyTenantFlagsToken(flagsCookie, tenantId) : null;
    let flagsData: { flags: Record<string, boolean>; createFlags: TenantCreateFlags } | null = verified;
    if (!flagsData) {
      try {
        const proto = hostname.includes('localhost') ? 'http' : 'https';
        const res = await fetch(`${proto}://${hostname}/api/tenant/flags-refresh`, {
          headers: {
            authorization: `Bearer ${session.access_token}`,
            // Forward the request's own cookies — fetch() does not attach them
            // automatically, and the route sits behind this same middleware, which
            // requires a valid Supabase session cookie to avoid redirecting to /login.
            cookie: request.headers.get('cookie') ?? '',
          },
        });
        if (res.ok) {
          freshTenantFlags = (await res.json()) as { flags: Record<string, boolean>; createFlags: TenantCreateFlags };
          flagsData = freshTenantFlags;
        }
      } catch {
        // Flags refresh unreachable — leave header unset, getFlag()'s own fallback
        // resolves directly (Node runtime, safe) when a Server Component calls it.
      }
    }
    if (flagsData) {
      requestHeaders.set(TENANT_FLAGS_HEADER, encodeTenantFlagsHeader(flagsData));
    }
  }

  // Role-based zone guards
  // Guard 2: buyers must stay in /buy — redirect them away from seller/root pages
  const isBuyerSafeZone =
    pathname.startsWith('/buy') ||
    pathname.startsWith('/consent') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    isPublicRoute(pathname);
  if (!isBuyerSafeZone && role?.startsWith('buyer_')) {
    return NextResponse.redirect(new URL('/buy/home', request.url));
  }

  // Recreate response so updated request headers propagate downstream, then
  // re-attach any cookies that Supabase may have refreshed on the earlier response.
  const finalized = NextResponse.next({ request: { headers: requestHeaders } });
  finalized.headers.set('x-tenant-subdomain', subdomain ?? '');
  for (const cookie of res.cookies.getAll()) {
    finalized.cookies.set(cookie);
  }
  if (freshTenantFlags && tenantId) {
    const token = await createTenantFlagsToken(tenantId, freshTenantFlags);
    finalized.cookies.set(TENANT_FLAGS_COOKIE, token, {
      httpOnly: true,
      path: '/',
      maxAge: TENANT_FLAGS_TTL_SECONDS,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  res = finalized;

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|robots.txt|sitemap.xml|\\.png|\\.jpg|\\.jpeg|\\.gif|\\.svg|\\.webp|\\.ico|\\.css|\\.js|\\.map|\\.txt|\\.woff|\\.woff2|\\.ttf).*)',
  ],
};
