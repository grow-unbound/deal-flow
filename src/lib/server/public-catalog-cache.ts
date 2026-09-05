import { revalidatePath, revalidateTag } from 'next/cache';
import { resolveTenantSlugById } from '@/lib/server/resolve-storefront-tenant';

/**
 * Called (unawaited, fire-and-forget, at ~15 catalog/price/brand/category
 * mutation endpoints) after a successful write. Two things happen:
 *
 * 1. `revalidateTag` — synchronous, always completes before this function
 *    returns control. This is what actually matters for correctness: it
 *    busts the `unstable_cache` Data Cache entries (getCachedGuestPricingContext,
 *    fetchCachedGuestBrands/Categories, fetchCachedBuyerBrands/Categories) that
 *    every buyer-facing API route reads from. The guest ISR pages under
 *    app/(buyer-guest) never embed catalog data in their cached HTML shell —
 *    CatalogFilteredBrowse/CatalogDiscoveryLanding/BuyerProductDetailClient are
 *    client components that fetch fresh from those same tag-invalidated API
 *    routes on every load — so the actual displayed data is never stale by
 *    more than this synchronous call, regardless of ISR page-cache state.
 *
 * 2. `revalidatePath` for the tenant's ISR shell — best-effort. This only
 *    affects the cached HTML shell (chrome + <title> from generateMetadata,
 *    e.g. a renamed category), not any catalog data (see above). Requires an
 *    async tenantId->slug lookup (cached, `resolveTenantSlugById`), so unlike
 *    the tag revalidation this isn't guaranteed to finish if the caller
 *    doesn't await this function — every existing call site doesn't. That's
 *    an accepted, bounded risk (a stale page <title> for up to the 120s ISR
 *    window, worst case) in exchange for not having to thread `await` through
 *    ~15 call sites for a cosmetic-only guarantee. Swallows its own errors —
 *    must never break the caller's response.
 */
export function revalidatePublicCatalogCache(tenantId: string) {
  revalidateTag(`public-catalog:${tenantId}`);
  void revalidateGuestIsrShell(tenantId);
}

async function revalidateGuestIsrShell(tenantId: string): Promise<void> {
  try {
    const slug = await resolveTenantSlugById(tenantId);
    if (!slug) return;
    revalidatePath(`/buy/g/${slug}/home`, 'layout');
    revalidatePath(`/buy/g/${slug}/product`, 'layout');
  } catch (err) {
    console.error('[revalidatePublicCatalogCache] ISR shell revalidation failed', err);
  }
}
