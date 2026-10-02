import { beforeEach, describe, expect, it, vi } from 'vitest';

// resolvePendingBuyerRedirect never returns the storefront home: the storefront shell sends every
// pending session on to /pending client-side, so landing on '/' only flashed the gated catalog
// first (and showed a blank screen). Intake-filed, declined and existing (seller/ERP-created)
// buyers all go straight to /pending; /onboarding and /resubmit-documents are unchanged.

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

  const states: Array<[string, Record<string, unknown>, string, string]> = [
    ['fresh self-registration without intake', { storefront_self_registered: true }, 'pending_approval', '/onboarding'],
    ['self-registered, intake filed, awaiting approval', { storefront_self_registered: true, intake_submitted_at: 'x' }, 'pending_approval', '/pending'],
    ['self-registered, declined', { storefront_self_registered: true, intake_submitted_at: 'x' }, 'declined', '/pending'],
    ['existing buyer, app off, no request', {}, 'approved', '/pending'],
    ['existing buyer, request open', { access_requested_at: 'x' }, 'approved', '/pending'],
    ['existing buyer, resubmitted and awaiting', { access_requested_at: 'x', intake_submitted_at: 'x' }, 'pending_approval', '/pending'],
    ['existing buyer, declined', { access_requested_at: 'x' }, 'declined', '/pending'],
    ['self-registered, needs_more_info', { storefront_self_registered: true, intake_submitted_at: 'x' }, 'needs_more_info', '/resubmit-documents'],
    ['self-registered, needs_more_info before any intake', { storefront_self_registered: true }, 'needs_more_info', '/resubmit-documents'],
    ['existing buyer, needs_more_info', { access_requested_at: 'x' }, 'needs_more_info', '/resubmit-documents'],
  ];

  it.each(states)('%s -> %s', async (_name, customFields, status, expected) => {
    mockCustomFields = customFields;
    mockOnboardingStatus = status;
    const { resolvePendingBuyerRedirect } = await import('@/lib/server/buyer-access');
    await expect(resolvePendingBuyerRedirect('buyer-1')).resolves.toBe(expected);
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
