import { headers } from 'next/headers';
import { getTenantBrandingBySlug } from '@/lib/server/tenant-branding';
import { StorefrontHandoffClient } from '@/components/buyer/auth/StorefrontHandoffClient';

/**
 * Cross-origin session handoff landing page — present on every tenant host.
 * A single-use, short-TTL magic-link token minted on catalog.useyukti.in (or
 * any other host) lands here; verifyOtp() runs client-side on THIS origin, so
 * the resulting session cookie is set first-party for this tenant, the only
 * way to establish a session on a host different from where OTP was verified
 * without sharing a cookie across origins.
 */
export default async function StorefrontHandoffPage() {
  const headerList = await headers();
  const slug = headerList.get('x-verified-tenant-slug');
  const record = slug ? await getTenantBrandingBySlug(slug) : null;
  const branding = record ? { businessName: record.businessName, logoUrl: record.logoUrl } : null;

  return <StorefrontHandoffClient branding={branding} />;
}
