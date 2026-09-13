export type BuyerOnboardingStatus = 'pending_approval' | 'needs_more_info' | 'approved' | 'declined' | null;

/**
 * Defense-in-depth for a `mode: 'pending'` buyer session (Task 10 review,
 * Minor #1). `onboarding_status` is meant to come back as 'pending_approval'
 * for any genuinely pending, self-registered buyer, but a few things could
 * leave it looking like there's nothing to show: the
 * get_buyer_onboarding_status RPC call failing/throwing (route.ts catches it
 * and falls back to null), or a buyer row that predates the fix in
 * `acquireBuyerForStorefront` inserting the onboarding_status default
 * ('approved', Task 1's migration) instead of 'pending_approval'.
 *
 * This fallback must NOT apply to buyers who were never self-registered —
 * `mode: 'pending'` only means `buyer_app_enabled = false`, which is also the
 * normal state for a seller-created or CSV-imported customer who simply
 * hasn't had buyer-app access switched on yet. Those buyers were never
 * through the self-registration/approval flow, so `onboarding_status` of
 * `null` or `'approved'` is factually correct for them — showing "Account
 * verification in progress" would be wrong (nobody is verifying anything).
 * The `isSelfRegistered` flag (`custom_fields.storefront_self_registered`,
 * set by `acquireBuyerForStorefront`) scopes the fallback to only the
 * population it actually describes: buyers awaiting seller approval after
 * self-registering through the storefront. For a non-self-registered buyer,
 * the status is passed through unchanged — whatever it genuinely is.
 */
export function resolvePendingSessionOnboardingStatus(
  status: BuyerOnboardingStatus,
  isSelfRegistered: boolean,
): BuyerOnboardingStatus {
  if (!isSelfRegistered) return status;
  if (status === null || status === 'approved') return 'pending_approval';
  return status;
}
