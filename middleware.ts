import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
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
  '/activate',
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
  '/manifest.webmanifest', // PWA manifest — browsers fetch it unauthenticated
  '/buyer-sw.js', // PWA service worker — must be reachable before any buyer session exists
  '/api/health', // warmup-ping target (external pinger) — must return a clean 200 unauthenticated
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
  // Strip any client-supplied x-verified-* headers unconditionally before anything
  // downstream can read them. These are trust boundary headers this middleware sets
  // from cryptographically verified JWT claims below — if a claim is falsy (e.g. an
  // unprovisioned/newly-signed-up session with no tenant_id yet), the conditional
  // .set() calls further down would otherwise leave an attacker-supplied value in
  // place, letting a client spoof tenant_id/role/buyer_id for every downstream route
  // handler and Server Component. Must happen even on the public-route early return
  // below, since requestHeaders is cloned from the raw request either way.
  requestHeaders.delete('x-verified-tenant-id');
  requestHeaders.delete('x-verified-role');
  requestHeaders.delete('x-verified-buyer-id');
  requestHeaders.delete('x-verified-location-ids');
  requestHeaders.delete('x-verified-user-id');
  const subdomain = extractSubdomain(hostname);
  requestHeaders.set('x-tenant-subdomain', subdomain ?? '');
  const res = NextResponse.next({ request: { headers: requestHeaders } });
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

  // Validate session via Supabase. getClaims() verifies the JWT signature locally
  // against this project's cached JWKS (asymmetric ES256 signing keys) instead of
  // making a network round-trip to the Auth API on every navigation like the old
  // @supabase/auth-helpers-nextjs getSession() path did — that network call (and
  // that deprecated package's cookie-sync bugs) was the source of the "Invalid
  // Refresh Token: Refresh Token Not Found" / fetch-failed(ETIMEDOUT) error clusters
  // seen in production, and the extra latency on every page load. getClaims() only
  // hits the network when the access token is actually expired and needs refreshing.
  //
  // Every cookie-touching Supabase client in this app (browser client, route
  // handlers, this middleware) must stay on @supabase/ssr consistently — mixing it
  // with the deprecated auth-helpers-nextjs breaks session cookie parsing across
  // the boundary (confirmed: caused a login-redirect-loop bug during development).
  const refreshedAuthCookies: { name: string; value: string; options?: CookieOptions }[] = [];
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            refreshedAuthCookies.push({ name, value, options });
          }
        },
      },
    },
  );

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname + (request.nextUrl.search || ''));
    return NextResponse.redirect(loginUrl);
  }

  // Custom claims set by custom_access_token_hook — getClaims() already verified
  // these cryptographically, no separate decode/trust step needed.
  const claims = claimsData.claims;
  const tenantId = (claims.tenant_id as string) ?? null;
  // Application role is stored under "user_role" post-migration.
  // Fall back to "role" for sessions issued before the JWT hook was updated
  // (fix_jwt_role_claim_collision migration); they auto-heal on token refresh.
  const role = (claims.user_role as string) ?? (claims.role as string) ?? null;
  const buyerId = (claims.buyer_id as string) ?? null;
  const locationIds = Array.isArray(claims.location_ids)
    ? claims.location_ids.filter((value): value is string => typeof value === 'string')
    : null;

  // Forward verified claims as headers; server components read these instead
  // of trusting any client-supplied tenant_id values.
  if (tenantId) requestHeaders.set('x-verified-tenant-id', tenantId);
  if (role) requestHeaders.set('x-verified-role', role);
  if (buyerId) requestHeaders.set('x-verified-buyer-id', buyerId);
  if (locationIds) requestHeaders.set('x-verified-location-ids', JSON.stringify(locationIds));
  if (claims.sub) requestHeaders.set('x-verified-user-id', claims.sub);

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
        const flagsRes = await fetch(`${proto}://${hostname}/api/tenant/flags-refresh`, {
          headers: {
            // Forward the request's own cookies — fetch() does not attach them
            // automatically. The route sits behind this same middleware, which
            // re-validates via getClaims() from these forwarded cookies and
            // populates x-verified-* headers for it directly, so no separate
            // Authorization bearer is needed here.
            cookie: request.headers.get('cookie') ?? '',
          },
        });
        if (flagsRes.ok) {
          freshTenantFlags = (await flagsRes.json()) as { flags: Record<string, boolean>; createFlags: TenantCreateFlags };
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
  // re-attach any cookies Supabase refreshed (via getClaims()'s internal refresh)
  // plus the tenant-flags cookie resolved above.
  const finalized = NextResponse.next({ request: { headers: requestHeaders } });
  finalized.headers.set('x-tenant-subdomain', subdomain ?? '');
  for (const cookie of refreshedAuthCookies) {
    finalized.cookies.set(cookie.name, cookie.value, cookie.options);
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

  return finalized;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|robots.txt|sitemap.xml|\\.png|\\.jpg|\\.jpeg|\\.gif|\\.svg|\\.webp|\\.ico|\\.css|\\.js|\\.map|\\.txt|\\.woff|\\.woff2|\\.ttf).*)',
  ],
};
