import { unstable_cache } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { firstStoredImageUrl } from '@/lib/r2-url';

export interface TenantBrandingRecord {
  tenantId: string;
  slug: string;
  businessName: string;
  tagline: string | null;
  logoUrl: string | null;
  whatsappNumber: string | null;
  isLive: boolean;
}

/**
 * Guest-safe tenant identity for branding surfaces (login continuity screen,
 * the storefront-handoff intermediate screen, the not-live page). Deliberately
 * separate from resolve-storefront-tenant.ts's hot-path resolver — this does a
 * richer, uncached fetch (business_name, logo_url, WhatsApp number) that
 * middleware doesn't need on every request, and its null return is the
 * authoritative "no such tenant at all" signal used to distinguish a real 404
 * from a dormant-but-real tenant.
 */
export async function getTenantBrandingBySlug(slug: string): Promise<TenantBrandingRecord | null> {
  if (!supabaseAdmin || !slug) return null;

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .schema('app')
    .from('tenants')
    .select('id, slug, business_name, tagline, logo_url, settings')
    .eq('slug', slug)
    .maybeSingle();

  if (tenantError) {
    console.error('[getTenantBrandingBySlug] tenant lookup failed', tenantError);
    return null;
  }
  if (!tenant?.id) return null; // genuinely no such tenant — real 404

  const [catalogRes, settingsRes] = await Promise.all([
    supabaseAdmin
      .schema('app')
      .from('catalogs')
      .select('live_at')
      .eq('tenant_id', tenant.id)
      .eq('kind', 'public')
      .is('deleted_at', null)
      .maybeSingle(),
    supabaseAdmin
      .schema('app')
      .from('tenant_settings')
      .select('settings')
      .eq('tenant_id', tenant.id)
      .maybeSingle(),
  ]);

  const settings = (settingsRes.data?.settings as Record<string, unknown> | null | undefined)
    ?? (tenant.settings as Record<string, unknown> | null | undefined);
  const rawBusiness = (settings?.business ?? {}) as Record<string, unknown>;
  const settingsLogoUrl = typeof rawBusiness.logo_url === 'string' && rawBusiness.logo_url.trim()
    ? firstStoredImageUrl([rawBusiness.logo_url.trim()])
    : null;
  const tenantColumnLogo = firstStoredImageUrl(
    typeof tenant.logo_url === 'string' ? [tenant.logo_url] : [],
  );
  const buyerApp = settings?.buyer_app as { whatsapp_number?: unknown } | undefined;
  const whatsappNumber = typeof buyerApp?.whatsapp_number === 'string' && buyerApp.whatsapp_number.trim()
    ? buyerApp.whatsapp_number.trim()
    : null;

  return {
    tenantId: tenant.id as string,
    slug: tenant.slug as string,
    businessName: (tenant.business_name as string) || tenant.slug as string,
    tagline: typeof tenant.tagline === 'string' && tenant.tagline.trim()
      ? tenant.tagline.trim()
      : null,
    logoUrl: tenantColumnLogo ?? settingsLogoUrl,
    whatsappNumber,
    isLive: Boolean(catalogRes.data?.live_at),
  };
}

/**
 * Cached wrapper — this runs on every storefront SSR page navigation
 * (loadStorefrontBrandingContext) plus every /api/public/tenant-branding hit,
 * for data (name/tagline/logo/WhatsApp number/live flag) that changes only on
 * a rare admin edit. TTL-only (no tag invalidation): a couple minutes of lag
 * on a branding edit is an acceptable trade for cutting this off the hot path.
 */
export function getCachedTenantBrandingBySlug(slug: string): Promise<TenantBrandingRecord | null> {
  return unstable_cache(
    () => getTenantBrandingBySlug(slug),
    ['tenant-branding', slug],
    { revalidate: 120 },
  )();
}
