import { describe, expect, it } from 'vitest';
import { isNeedsMoreInfoBuyer, pendingBuyerDestination } from '@/lib/buyer-pending-destination';

const pending = (p: Record<string, unknown>) => ({ mode: 'pending', pending: p }) as never;

describe('pendingBuyerDestination', () => {
  it('sends needs_more_info to the resubmit form even when intake was never submitted', () => {
    const me = pending({ onboarding_status: 'needs_more_info', intake_submitted: false });
    expect(isNeedsMoreInfoBuyer(me)).toBe(true);
    expect(pendingBuyerDestination(me)).toBe('/resubmit-documents');
  });

  it('sends an intake-complete pending buyer to /pending', () => {
    const me = pending({ onboarding_status: 'pending_approval', intake_submitted: true });
    expect(isNeedsMoreInfoBuyer(me)).toBe(false);
    expect(pendingBuyerDestination(me)).toBe('/pending');
  });

  it('sends a fresh self-registration to /onboarding', () => {
    expect(pendingBuyerDestination(pending({ onboarding_status: 'pending_approval', intake_submitted: false }))).toBe('/onboarding');
  });

  it('does not treat approved buyers or guests as needs_more_info', () => {
    expect(isNeedsMoreInfoBuyer({ mode: 'buyer' } as never)).toBe(false);
    expect(isNeedsMoreInfoBuyer(undefined)).toBe(false);
  });
});
