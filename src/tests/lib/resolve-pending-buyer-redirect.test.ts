import { beforeEach, describe, expect, it, vi } from 'vitest';

// Task 10: resolvePendingBuyerRedirect now sends an intake-complete
// buyer_pending session to the storefront home ('/') instead of
// unconditionally to '/pending' — '/pending' is reached via the
// OnboardingStatusPill tap, not a forced landing page. The /onboarding
// redirect for an incomplete self-registration must stay exactly as-is.
//
// Task 10 review fix (Important #1): the storefront-home branch is
// host-aware — '/' only on a tenant host, '/buy/home' otherwise — mirroring
// the sibling `storefrontHome` computation in phone-otp/verify/route.ts.

let mockCustomFields: Record<string, unknown> | null = null;
let mockOnboardingStatus: string | null = 'pending_approval';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { custom_fields: mockCustomFields, onboarding_status: mockOnboardingStatus },
              error: null,
            })),
          })),
        })),
      })),
    })),
  },
}));

describe('resolvePendingBuyerRedirect', () => {
  beforeEach(() => {
    mockCustomFields = null;
    mockOnboardingStatus = 'pending_approval';
  });

  it('sends a fresh self-registration that has not submitted intake to /onboarding, regardless of host', async () => {
    mockCustomFields = { storefront_self_registered: true };
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1', true)).resolves.toBe('/onboarding');
    await expect(resolvePendingBuyerRedirect('buyer-1', false)).resolves.toBe('/onboarding');
  });

  it('sends a self-registered buyer who has submitted intake to the storefront home, not /pending', async () => {
    mockCustomFields = { storefront_self_registered: true, intake_submitted_at: '2026-09-11T00:00:00Z' };
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1', true)).resolves.toBe('/');
  });

  it('sends a known (non-self-registered) buyer a seller disabled to /pending, regardless of host', async () => {
    mockCustomFields = {};
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1', true)).resolves.toBe('/pending');
    await expect(resolvePendingBuyerRedirect('buyer-1', false)).resolves.toBe('/pending');
  });

  it('sends any buyer with intake_submitted_at set to the storefront home, regardless of self-registration', async () => {
    mockCustomFields = { intake_submitted_at: '2026-09-11T00:00:00Z' };
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1', true)).resolves.toBe('/');
  });

  it('sends an intake-complete buyer to /buy/home instead of / when not on a tenant host', async () => {
    mockCustomFields = { storefront_self_registered: true, intake_submitted_at: '2026-09-11T00:00:00Z' };
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1', false)).resolves.toBe('/buy/home');
  });

  it('sends a buyer whose request was sent back for more info to /resubmit-documents, not the storefront/pending', async () => {
    mockCustomFields = { storefront_self_registered: true, intake_submitted_at: '2026-09-11T00:00:00Z' };
    mockOnboardingStatus = 'needs_more_info';
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1', true)).resolves.toBe('/resubmit-documents');
    await expect(resolvePendingBuyerRedirect('buyer-1', false)).resolves.toBe('/resubmit-documents');
  });

  it('resolveNeedsMoreInfoRedirect returns the resubmit path only for needs_more_info', async () => {
    const { resolveNeedsMoreInfoRedirect } = await import('@/lib/server/buyer-access');
    mockOnboardingStatus = 'needs_more_info';
    await expect(resolveNeedsMoreInfoRedirect('buyer-1')).resolves.toBe('/resubmit-documents');
    mockOnboardingStatus = 'pending_approval';
    await expect(resolveNeedsMoreInfoRedirect('buyer-1')).resolves.toBeNull();
    await expect(resolveNeedsMoreInfoRedirect(null)).resolves.toBeNull();
  });
});
