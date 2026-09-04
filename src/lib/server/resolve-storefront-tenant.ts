import { supabaseAdmin } from '@/lib/supabase';

export interface StorefrontTenantRecord {
  tenantId: string;
  slug: string;
  catalogId: string | null;
  liveAt: string | null;
  pricingMode: 'hidden_until_login' | 'base_selling_rate' | 'assigned_price_list' | null;
  priceListId: string | null;
}

// In-process, per-warm-instance cache. Live/pricing-mode changes rarely (a seller
// action, not per-request state), so a short TTL removes the DB round-trip from the
// hot path of every tenant-host navigation and guest API call without risking a
// stale storefront staying live/dormant for more than a few seconds after a change.
// Fails open to a fresh DB read on miss/expiry/cold-start — never the source of truth.
const CACHE_TTL_MS = 30_000;
const bySlug = new Map<string, { value: StorefrontTenantRecord | null; expiresAt: number }>();
const slugByTenantId = new Map<string, { value: string | null; expiresAt: number }>();

function getCached<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string, now: number): T | undefined {
  const hit = cache.get(key);
  if (!hit || hit.expiresAt <= now) return undefined;
  return hit.value;
}

function setCached<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string, value: T, now: number): void {
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
}

export async function resolveStorefrontTenantBySlug(slug: string): Promise<StorefrontTenantRecord | null> {
  if (!supabaseAdmin || !slug) return null;

  const now = Date.now();
  const cached = getCached(bySlug, slug, now);
  if (cached !== undefined) return cached;

  // Single round-trip: inner-join catalogs -> tenants and filter on the embedded
  // relation, instead of a tenant lookup followed by a separate catalog lookup.
  const { data, error } = await supabaseAdmin
    .schema('app')
    .from('catalogs')
    .select('id, live_at, pricing_mode, price_list_id, tenant:tenants!inner(id, slug)')
    .eq('kind', 'public')
    .is('deleted_at', null)
    .eq('tenant.slug', slug)
    .maybeSingle();

  if (error) {
    console.error('[resolveStorefrontTenantBySlug] lookup error', error);
    // Do not cache a transient failure — retry on the next request.
    return null;
  }

  const tenant = (data?.tenant ?? null) as { id: string; slug: string } | null;
  const record: StorefrontTenantRecord | null = tenant
    ? {
        tenantId: tenant.id,
        slug: tenant.slug,
        catalogId: (data?.id as string | undefined) ?? null,
        liveAt: (data?.live_at as string | null | undefined) ?? null,
        pricingMode: (data?.pricing_mode as StorefrontTenantRecord['pricingMode'] | undefined) ?? null,
        priceListId: (data?.price_list_id as string | null | undefined) ?? null,
      }
    : null;

  setCached(bySlug, slug, record, now);
  return record;
}

export function isPublicCatalogLive(record: StorefrontTenantRecord | null): boolean {
  return Boolean(record?.liveAt);
}

/** Reverse lookup used to redirect a buyer session on app.useyukti.in to their own
 * tenant's canonical storefront, instead of a single hardcoded tenant. */
export async function resolveTenantSlugById(tenantId: string): Promise<string | null> {
  if (!supabaseAdmin || !tenantId) return null;

  const now = Date.now();
  const cached = getCached(slugByTenantId, tenantId, now);
  if (cached !== undefined) return cached;

  const { data, error } = await supabaseAdmin
    .schema('app')
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    console.error('[resolveTenantSlugById] lookup error', error);
    return null;
  }

  const slug = (data?.slug as string | undefined) ?? null;
  setCached(slugByTenantId, tenantId, slug, now);
  return slug;
}
