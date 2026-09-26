import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { BuyerAccessProfile } from '@/lib/server/buyer-access';
import {
  loadLivePublicCatalog,
  resolveGuestPricingContext,
  type GuestPricingContext,
  type PublicCatalogRecord,
} from '@/lib/server/public-catalog';

/**
 * Single source of truth for "this buyer session is not approved for the buyer app".
 *
 * A pending session is a `buyer_pending` JWT (self-registered / awaiting approval) or a
 * buyer row with `buyer_app_enabled === false` (Zoho buyers with access off, declined,
 * needs-more-info). Seller preview is never pending.
 *
 * Policy for buyer-facing catalog/priced routes:
 *  - approved buyer          -> unchanged (buyer-specific pricing)
 *  - pending + public_link   -> guest data only (buyerId = null, GUEST pricing)
 *  - pending + anything else -> 403 { error: 'Approval required' }, `private, no-store`
 *
 * Policy for buyer-account routes (metrics, activity, documents, ...): pending -> 403.
 */
export function isPendingBuyerCatalogSession(profile: BuyerAccessProfile): boolean {
  return profile.context.mode !== 'preview'
    && (profile.context.role === 'buyer_pending' || profile.buyer?.buyer_app_enabled === false);
}

export function approvalRequiredResponse(): NextResponse {
  return NextResponse.json({ error: 'Approval required' }, {
    status: 403,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

/**
 * Account/priced-data routes that have no guest fallback. Returns a 403 response for a
 * pending session, otherwise null.
 */
export function guardPendingBuyerAccount(profile: BuyerAccessProfile): NextResponse | null {
  return isPendingBuyerCatalogSession(profile) ? approvalRequiredResponse() : null;
}

export interface PendingBuyerCatalogGate {
  /** True when the session is pending: callers must use buyerId=null + guest pricing. */
  pending: boolean;
  /** Set (403) when the session is pending and the tenant does not allow public browsing. */
  blocked: NextResponse | null;
  /** The live public catalog when it was loaded for a pending session (else null). */
  publicCatalog: PublicCatalogRecord | null;
  /** GUEST pricing context to use instead of buyer pricing (pending + public_link only). */
  guestPricing: GuestPricingContext | null;
}

/**
 * Catalog routes that can serve guest data. Only hits the DB for pending sessions.
 */
export async function guardPendingBuyerCatalogAccess(
  db: SupabaseClient,
  profile: BuyerAccessProfile,
): Promise<PendingBuyerCatalogGate> {
  if (!isPendingBuyerCatalogSession(profile)) {
    return { pending: false, blocked: null, publicCatalog: null, guestPricing: null };
  }
  const publicCatalog = await loadLivePublicCatalog(db, profile.context.tenant_id!);
  if (publicCatalog?.accessMode !== 'public_link') {
    return { pending: true, blocked: approvalRequiredResponse(), publicCatalog: null, guestPricing: null };
  }
  const guestPricing = await resolveGuestPricingContext(db, profile.context.tenant_id!);
  return { pending: true, blocked: null, publicCatalog, guestPricing };
}

/** Buyer id that may be used for buyer-scoped pricing/visibility; null for pending sessions. */
export function effectiveBuyerIdForCatalog(profile: BuyerAccessProfile): string | null {
  return isPendingBuyerCatalogSession(profile) ? null : (profile.buyer?.id ?? null);
}

/**
 * SSR re-check for pages that only have JWT claims: a stale `buyer_admin` token can outlive a
 * buyer whose app access was switched off, so the role claim alone is not proof of approval.
 * Reads the live buyer row; fails closed (false) on any error or missing/inactive row.
 * `buyer_app_enabled` is NOT NULL, so `true` is the only approved state.
 */
export async function isBuyerAppAccessEnabledInDb(
  db: SupabaseClient,
  tenantId: string,
  buyerId: string,
): Promise<boolean> {
  try {
    const { data, error } = await db
      .schema('app')
      .from('buyers')
      .select('buyer_app_enabled')
      .eq('id', buyerId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { buyer_app_enabled: boolean | null }).buyer_app_enabled === true;
  } catch {
    return false;
  }
}
