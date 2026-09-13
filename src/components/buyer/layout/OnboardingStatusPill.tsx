'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export type OnboardingPillStatus = 'pending_approval' | 'needs_more_info' | 'approved' | 'declined' | null | undefined;

interface OnboardingStatusPillProps {
  status: OnboardingPillStatus;
  className?: string;
}

const LABELS: Record<'pending_approval' | 'needs_more_info' | 'declined', string> = {
  pending_approval: 'Account verification in progress',
  needs_more_info: 'More info needed',
  declined: 'Access declined',
};

/**
 * Task 10 / Yukti_Public-Signup_Frontend-Spec_v1.md §1.1 row 4 + §0b's
 * status-pill-placement resolution. Rendered immediately left of the
 * storefront header's Login button (both desktop and mobile) for a
 * `buyer_pending` session — replaces the Login affordance entirely while
 * onboarding_status is pending_approval / needs_more_info / declined;
 * renders nothing (and the normal Login button shows instead) once
 * onboarding_status is 'approved' or the session isn't pending at all.
 *
 * Tapping the pill navigates to /pending for pending_approval and declined
 * (the existing gated-status screen / DeclinedContactScreen, see
 * app/pending/page.tsx). Task 11: needs_more_info now navigates to
 * /resubmit-documents instead — the forced-re-OTP document-resubmission
 * flow (Yukti_Public-Signup_Frontend-Spec_v1.md §0b) — replacing the
 * Task 10 stub that landed everything on /pending.
 */
export function OnboardingStatusPill({ status, className }: OnboardingStatusPillProps): React.ReactNode {
  const router = useRouter();

  if (!status || status === 'approved') return null;

  const label = LABELS[status];
  if (!label) return null;

  const toneClass = status === 'declined'
    ? 'border-cream-300 bg-cream-100 text-cream-700 hover:bg-cream-200'
    : 'border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100';

  const destination = status === 'needs_more_info' ? '/resubmit-documents' : '/pending';

  return (
    <button
      type="button"
      onClick={() => router.push(destination)}
      aria-label={`${label}. Tap to view status.`}
      className={cn(
        'inline-flex h-9 max-w-[48vw] shrink-0 items-center gap-1.5 truncate rounded-full border px-3 text-xs font-semibold transition-colors duration-fast sm:max-w-[220px]',
        toneClass,
        className,
      )}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
