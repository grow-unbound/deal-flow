import type { LoginOtpCandidate } from '@/lib/server/buyer-otp-store';
import { isReservedStorefrontLabel } from '@/lib/storefront-host';

export function tenantSlugFromReturnTo(returnTo: string | null | undefined): string | null {
  if (!returnTo?.trim()) return null;
  try {
    const slug = new URL(returnTo.trim()).hostname.split('.')[0]?.toLowerCase();
    if (!slug || isReservedStorefrontLabel(slug)) return null;
    return slug;
  } catch {
    return null;
  }
}

/** Buyer accounts for the tenant named in `return_to`, if any. */
export function filterBuyerCandidatesForReturnTo(
  candidates: LoginOtpCandidate[],
  returnTo: string | null | undefined,
): LoginOtpCandidate[] {
  const slug = tenantSlugFromReturnTo(returnTo);
  if (!slug) return [];
  return candidates.filter(
    (c) => c.kind === 'buyer' && c.tenant_slug?.toLowerCase() === slug,
  );
}

const BUYER_ROLE_PRIORITY: Record<string, number> = {
  buyer_admin: 0,
  buyer_assistant: 1,
};

/** Prefer buyer_admin; stable tie-break on business name. */
export function pickPreferredBuyerCandidate(candidates: LoginOtpCandidate[]): LoginOtpCandidate {
  return [...candidates].sort((a, b) => {
    const priorityA = BUYER_ROLE_PRIORITY[a.role] ?? 99;
    const priorityB = BUYER_ROLE_PRIORITY[b.role] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return (a.business_name ?? '').localeCompare(b.business_name ?? '');
  })[0]!;
}
