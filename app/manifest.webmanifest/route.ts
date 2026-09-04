import { NextRequest, NextResponse } from 'next/server';
import { parseRequestHost } from '@/lib/storefront-host';
import { getTenantBrandingBySlug } from '@/lib/server/tenant-branding';
import { buildStorefrontManifest } from '@/lib/server/storefront-manifest';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const hostKind = parseRequestHost(request.headers.get('host') ?? '');
  const isTenantHost = hostKind.kind === 'tenant';

  let branding = null;
  if (isTenantHost) {
    branding = await getTenantBrandingBySlug(hostKind.slug);
  }

  const manifest = buildStorefrontManifest(
    branding
      ? { businessName: branding.businessName, tagline: branding.tagline }
      : null,
    { installable: isTenantHost && Boolean(branding) },
  );

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
