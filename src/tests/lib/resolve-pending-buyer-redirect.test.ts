import { beforeEach, describe, expect, it, vi } from 'vitest';

// Task 10: resolvePendingBuyerRedirect now sends an intake-complete
// buyer_pending session to the storefront home ('/') instead of
// unconditionally to '/pending' — '/pending' is reached via the
// OnboardingStatusPill tap, not a forced landing page. The /onboarding
// redirect for an incomplete self-registration must stay exactly as-is.

let mockCustomFields: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { custom_fields: mockCustomFields },
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
  });

  it('sends a fresh self-registration that has not submitted intake to /onboarding', async () => {
    mockCustomFields = { storefront_self_registered: true };
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1')).resolves.toBe('/onboarding');
  });

  it('sends a self-registered buyer who has submitted intake to the storefront home, not /pending', async () => {
    mockCustomFields = { storefront_self_registered: true, intake_submitted_at: '2026-09-11T00:00:00Z' };
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1')).resolves.toBe('/');
  });

  it('sends a known (non-self-registered) buyer a seller disabled to /pending', async () => {
    mockCustomFields = {};
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1')).resolves.toBe('/pending');
  });

  it('sends any buyer with intake_submitted_at set to the storefront home, regardless of self-registration', async () => {
    mockCustomFields = { intake_submitted_at: '2026-09-11T00:00:00Z' };
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1')).resolves.toBe('/');
  });
});
