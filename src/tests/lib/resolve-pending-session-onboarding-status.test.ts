import { describe, expect, it } from 'vitest';
import { resolvePendingSessionOnboardingStatus } from '@/lib/server/buyer-onboarding-status';

// Task 10 review, Minor #1: a mode:'pending' session must never present as
// if there's nothing to show (the OnboardingStatusPill renders nothing for
// null/'approved') — defense-in-depth against the RPC failing/throwing, or
// a buyer row whose onboarding_status wasn't set to 'pending_approval' at
// creation time (see the acquireBuyerForStorefront fix, Critical #1).
describe('resolvePendingSessionOnboardingStatus', () => {
  it('falls back to pending_approval when the status is null', () => {
    expect(resolvePendingSessionOnboardingStatus(null)).toBe('pending_approval');
  });

  it('falls back to pending_approval when the status is approved', () => {
    expect(resolvePendingSessionOnboardingStatus('approved')).toBe('pending_approval');
  });

  it('passes pending_approval through unchanged', () => {
    expect(resolvePendingSessionOnboardingStatus('pending_approval')).toBe('pending_approval');
  });

  it('passes needs_more_info through unchanged', () => {
    expect(resolvePendingSessionOnboardingStatus('needs_more_info')).toBe('needs_more_info');
  });

  it('passes declined through unchanged', () => {
    expect(resolvePendingSessionOnboardingStatus('declined')).toBe('declined');
  });
});
