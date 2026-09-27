import { describe, expect, it } from 'vitest';
import { resolvePendingSessionOnboardingStatus } from '@/lib/server/buyer-onboarding-status';

// Task 10 review, Minor #1: a mode:'pending' session must never present as
// if there's nothing to show (the OnboardingStatusPill renders nothing for
// null/'approved') — defense-in-depth against the RPC failing/throwing, or
// a buyer row whose onboarding_status wasn't set to 'pending_approval' at
// creation time (see the acquireBuyerForStorefront fix, Critical #1).
//
// Scoped in the second review pass: the fallback must only relabel a
// genuinely self-registered buyer (custom_fields.storefront_self_registered
// === true) awaiting approval. mode:'pending' also covers seller-created /
// CSV-imported buyers with buyer_app_enabled=false who were never through
// the self-registration flow at all — for them, null/'approved' is the
// truth, not "still verifying".
describe('resolvePendingSessionOnboardingStatus', () => {
  describe('self-registered buyer (isSelfRegistered = true)', () => {
    it('falls back to pending_approval when the status is null', () => {
      expect(resolvePendingSessionOnboardingStatus(null, true)).toBe('pending_approval');
    });

    it('falls back to pending_approval when the status is approved', () => {
      expect(resolvePendingSessionOnboardingStatus('approved', true)).toBe('pending_approval');
    });

    it('passes pending_approval through unchanged', () => {
      expect(resolvePendingSessionOnboardingStatus('pending_approval', true)).toBe('pending_approval');
    });

    it('passes needs_more_info through unchanged', () => {
      expect(resolvePendingSessionOnboardingStatus('needs_more_info', true)).toBe('needs_more_info');
    });

    it('passes declined through unchanged', () => {
      expect(resolvePendingSessionOnboardingStatus('declined', true)).toBe('declined');
    });
  });

  describe('non-self-registered buyer (isSelfRegistered = false)', () => {
    it('leaves a null status untouched — never relabels as pending_approval', () => {
      expect(resolvePendingSessionOnboardingStatus(null, false)).toBe(null);
    });

    it('leaves an approved status untouched — a seller-created buyer with buyer_app_enabled=false is genuinely approved, not "still verifying"', () => {
      expect(resolvePendingSessionOnboardingStatus('approved', false)).toBe('approved');
    });

    it('passes needs_more_info through unchanged', () => {
      expect(resolvePendingSessionOnboardingStatus('needs_more_info', false)).toBe('needs_more_info');
    });

    it('passes declined through unchanged', () => {
      expect(resolvePendingSessionOnboardingStatus('declined', false)).toBe('declined');
    });
  });
});
