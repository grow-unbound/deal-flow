import { NextRequest, NextResponse } from 'next/server';
import { getCachedTenantBrandingBySlug } from '@/lib/server/tenant-branding';
import { clientIpFromRequest, consumeEnumerationRateLimit, consumePublicCatalogRateLimit, tooManyRequestsResponse } from '@/lib/server/public-catalog-rate-limit';

/**
 * GET /api/public/tenant-branding?slug=<slug>
 *
 * Guest-safe, deliberately minimal: name + logo + WhatsApp number only, never
 * anything else about a tenant. Powers the login-continuity screen on
 * catalog.useyukti.in, the storefront-handoff intermediate screen, and the
 * not-live page — all reachable by an unauthenticated visitor who only knows
 * a slug. Rate-limited the same as public catalog browsing: this is exactly
 * the same slug-enumeration surface, just returning branding instead of
 * products.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')?.trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  const ip = clientIpFromRequest(request.headers);
  // Global-per-IP check first (catches one IP probing many different slugs),
  // then per-(ip,slug) (catches hammering one slug specifically).
  const enumerationLimit = await consumeEnumerationRateLimit(ip);
  if (!enumerationLimit.ok) {
    return tooManyRequestsResponse(enumerationLimit.retryAfterSec);
  }
  const limited = await consumePublicCatalogRateLimit(ip, slug, 'browse');
  if (!limited.ok) {
    return tooManyRequestsResponse(limited.retryAfterSec);
  }

  const branding = await getCachedTenantBrandingBySlug(slug);
  if (!branding) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(
    {
      business_name: branding.businessName,
      tagline: branding.tagline,
      logo_url: branding.logoUrl,
      whatsapp_number: branding.whatsappNumber,
      is_live: branding.isLive,
    },
    // Guest-safe, zero per-visitor variance (same response for every caller of
    // a given slug, already rate-limited against enumeration above) — safe to
    // actually hit the CDN, unlike the buyer/guest-shared routes.
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' } },
  );
}
