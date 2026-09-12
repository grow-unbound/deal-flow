export type BuyerOnboardingStatus = 'pending_approval' | 'needs_more_info' | 'approved' | 'declined' | null;

/**
 * Defense-in-depth for a `mode: 'pending'` buyer session (Task 10 review,
 * Minor #1). `onboarding_status` is meant to come back as 'pending_approval'
 * for any genuinely pending buyer, but a few things could leave it looking
 * like there's nothing to show: the get_buyer_onboarding_status RPC call
 * failing/throwing (route.ts catches it and falls back to null), or a buyer
 * row that predates the fix in `acquireBuyerForStorefront` inserting the
 * onboarding_status default ('approved', Task 1's migration) instead of
 * 'pending_approval'. Either way, a `buyer_pending` session must never
 * render as if it's fully approved — treat null/'approved' as
 * 'pending_approval' so the OnboardingStatusPill always has something to
 * show instead of leaving the header's action slot empty.
 */
export function resolvePendingSessionOnboardingStatus(
  status: BuyerOnboardingStatus,
): 'pending_approval' | 'needs_more_info' | 'declined' {
  if (status === null || status === 'approved') return 'pending_approval';
  return status;
}
