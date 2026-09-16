import type { User } from '@supabase/supabase-js';
import type { JWTClaims } from '@/lib/auth';
import { SELLER_ROLES } from '@/constants';
import { isValidIndianMobile, normalizeIndianPhone } from '@/lib/phone';
import type { BuyerLoginCandidate } from '@/lib/server/buyer-access';
import type { LoginOtpCandidate } from '@/lib/server/buyer-otp-store';

export type SwitchLookupPhone =
  | { phone: string; source: 'otp_verified' }
  | { phone: string; source: 'authenticated_identity' };

function normalizeAuthPhone(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = normalizeIndianPhone(value);
  return isValidIndianMobile(normalized) ? normalized : null;
}

/**
 * Prefer the OTP-verified app_metadata anchor. Existing authenticated seller
 * sessions may predate that metadata and still carry their domain-owned phone
 * on the auth identity; callers using that fallback must restrict candidates
 * to rows already linked to the same auth user id.
 */
export function resolveSwitchLookupPhone(user: User): SwitchLookupPhone | null {
  const appMetadata = user.app_metadata as Record<string, unknown> | null;
  const otpVerifiedPhone = normalizeAuthPhone(appMetadata?.otp_verified_phone);
  if (otpVerifiedPhone) return { phone: otpVerifiedPhone, source: 'otp_verified' };

  const directPhone = normalizeAuthPhone(user.phone);
  if (directPhone) return { phone: directPhone, source: 'authenticated_identity' };

  const userMetadata = user.user_metadata as Record<string, unknown> | null;
  const metadataPhone =
    normalizeAuthPhone(userMetadata?.phone)
    ?? normalizeAuthPhone(userMetadata?.phone_number);
  return metadataPhone ? { phone: metadataPhone, source: 'authenticated_identity' } : null;
}

export function restrictCandidatesToAuthenticatedUser<T extends LoginOtpCandidate | BuyerLoginCandidate>(
  candidates: T[],
  claims: Pick<JWTClaims, 'sub'>,
  lookup: SwitchLookupPhone,
): T[] {
  if (lookup.source === 'otp_verified') return candidates;
  if (!claims.sub) return [];
  return candidates.filter((candidate) => candidate.user_id === claims.sub);
}

export function restrictSwitchContextCandidates(
  candidates: LoginOtpCandidate[],
  claims: Pick<JWTClaims, 'sub' | 'tenant_id' | 'role'>,
  lookup: SwitchLookupPhone,
): LoginOtpCandidate[] {
  if (lookup.source === 'otp_verified') return candidates;
  if (!claims.sub) return [];

  const isSellerSession = claims.role !== null && (SELLER_ROLES as readonly string[]).includes(claims.role);
  const currentSellerCandidateFound = isSellerSession
    && candidates.some((candidate) =>
      candidate.kind === 'seller'
      && candidate.user_id === claims.sub
      && candidate.tenant_id === claims.tenant_id
      && candidate.buyer_id === null,
    );

  if (currentSellerCandidateFound) {
    return candidates.filter((candidate) => candidate.kind === 'seller');
  }

  return candidates.filter((candidate) => candidate.user_id === claims.sub);
}
