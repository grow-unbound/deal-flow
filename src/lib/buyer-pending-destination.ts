import type { BuyerMeData } from '@/hooks/useBuyerMe';

export const RESUBMIT_DOCUMENTS_ROUTE = '/resubmit-documents';

type PendingMe = Pick<BuyerMeData, 'mode' | 'pending'> | null | undefined;

/** True for a pending buyer whose seller asked for more information. */
export function isNeedsMoreInfoBuyer(me: PendingMe): boolean {
  return me?.mode === 'pending' && me.pending?.onboarding_status === 'needs_more_info';
}

/** True for a storefront self-registered buyer who still owes the intake form. */
export function needsIntakeForm(me: PendingMe): boolean {
  return me?.mode === 'pending' && me.pending?.self_registered === true && !me.pending.intake_submitted;
}

/**
 * Where a `mode: 'pending'` buyer belongs. needs_more_info wins over the intake flag: the buyer
 * must land on the prefilled resubmission form, never the catalog or a fresh intake form.
 * Only self-registered buyers get the intake form; an existing buyer whose app access is disabled
 * goes to /pending, where they can request access.
 */
export function pendingBuyerDestination(me: PendingMe): string {
  if (isNeedsMoreInfoBuyer(me)) return RESUBMIT_DOCUMENTS_ROUTE;
  return needsIntakeForm(me) ? '/onboarding' : '/pending';
}
