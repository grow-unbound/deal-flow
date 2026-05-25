import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { decodeJWTPayload } from '@/lib/auth';
import type { Database } from '@/types/database';

// Routes that don't require an authenticated session
const PUBLIC_PREFIXES = [
  '/api/auth',
  '/auth',
  '/login',
  '/signup',
  '/_next',
  '/favicon.ico',
  '/ingest', // PostHog analytics proxy — must be public so rewrites can forward it
  '/api/debug', // Diagnostic endpoint — remove from PUBLIC_PREFIXES before going to production
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function extractSubdomain(hostname: string): string | null {
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    return null;
  }
  const parts = hostname.split('.');
  return parts.length > 2 ? parts[0] : null;
}

export async function middleware(request: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') ?? '';

  // Build response with subdomain header for downstream use
  const subdomain = extractSubdomain(hostname);
  res.headers.set('x-tenant-subdomain', subdomain ?? '');

  // Always pass subdomain on the mutated request headers too
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-subdomain', subdomain ?? '');

  if (isPublicRoute(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Validate session via Supabase (reads cookies, refreshes if needed)
  const supabase = createMiddlewareClient<Database>({ req: request, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('reason', 'session_expired');
    return NextResponse.redirect(loginUrl);
  }

  // Decode JWT payload to extract custom claims set by custom_access_token_hook.
  // getSession() already validated the token cryptographically via Supabase.
  let tenantId: string | null = null;
  let role: string | null = null;
  let buyerId: string | null = null;

  try {
    const payload = decodeJWTPayload(session.access_token);
    tenantId = (payload.tenant_id as string) ?? null;
    role = (payload.role as string) ?? null;
    buyerId = (payload.buyer_id as string) ?? null;
  } catch {
    // Malformed token — treat as expired
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('reason', 'session_expired');
    return NextResponse.redirect(loginUrl);
  }

  // Forward verified claims as headers; server components read these instead
  // of trusting any client-supplied tenant_id values.
  if (tenantId) requestHeaders.set('x-verified-tenant-id', tenantId);
  if (role) requestHeaders.set('x-verified-role', role);
  if (buyerId) requestHeaders.set('x-verified-buyer-id', buyerId);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|\\.png|\\.jpg|\\.jpeg|\\.gif|\\.svg).*)',
  ],
};
