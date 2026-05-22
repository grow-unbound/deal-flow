import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const hostname = request.headers.get('host') || '';
  const pathname = url.pathname;

  // Extract subdomain from hostname
  // Format: {slug}.dealflow.in or localhost:3000
  const hostParts = hostname.split('.');
  const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');

  let subdomain: string | null = null;

  if (!isLocalhost && hostParts.length > 2) {
    // Extract subdomain from {slug}.dealflow.in
    subdomain = hostParts[0];
  } else if (isLocalhost) {
    // Check for subdomain in URL path for local dev
    // Support both {slug}.localhost:3000 and localhost:3000/{slug}
    const pathParts = pathname.split('/').filter(Boolean);
    if (pathParts.length > 0 && !pathname.startsWith('/api') && !pathname.startsWith('/auth')) {
      // Could be a slug in the path, but we'll prefer header-based routing
      // For local dev, use localhost directly without subdomain
    }
  }

  // Skip middleware for public routes
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/auth')) {
    return NextResponse.next();
  }

  // Set subdomain in request header for downstream access
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-subdomain', subdomain || '');

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    // Include everything except static files and API
    '/((?!_next/static|_next/image|favicon.ico|\.png|\.jpg|\.jpeg|\.gif|\.svg).*)',
  ],
};
