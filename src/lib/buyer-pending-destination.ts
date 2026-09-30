import type { BuyerMeData } from '@/hooks/useBuyerMe';

export const RESUBMIT_DOCUMENTS_ROUTE = '/resubmit-documents';

type PendingMe = Pick<BuyerMeData, 'mode' | 'pending'> | null | undefined;

/** True for a pending buyer whose seller asked for more information. */
export function isNeedsMoreInfoBuyer(me: PendingMe): boolean {
  return me?.mode === 'pending' && me.pending?.onboarding_status === 'needs_more_info';
}

/**
 * Where a `mode: 'pending'` buyer belongs. needs_more_info wins over the intake flag: the buyer
 * must land on the prefilled resubmission form, never the catalog or a fresh intake form.
 */
export function pendingBuyerDestination(me: PendingMe): string {
  if (isNeedsMoreInfoBuyer(me)) return RESUBMIT_DOCUMENTS_ROUTE;
  return me?.pending?.intake_submitted ? '/pending' : '/onboarding';
}
