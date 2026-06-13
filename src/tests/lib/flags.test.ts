import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEvaluateFlags = vi.fn();

vi.mock('posthog-node', () => ({
  PostHog: function PostHog() {
    return {
      evaluateFlags: mockEvaluateFlags,
    };
  },
}));

import { getFlag } from '@/lib/flags';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key';
});

describe('getFlag', () => {
  it('returns false for unknown flag name when PostHog returns undefined', async () => {
    mockEvaluateFlags.mockResolvedValue({
      isEnabled: vi.fn().mockReturnValue(undefined),
    });

    const result = await getFlag('unknown_flag_xyz', 'tenant-123');

    expect(result).toBe(false);
  });

  it('returns true when PostHog returns true for df_integrations', async () => {
    mockEvaluateFlags.mockResolvedValue({
      isEnabled: vi.fn().mockReturnValue(true),
    });

    const result = await getFlag('df_integrations', 'tenant-123');

    expect(result).toBe(true);
  });

  it('returns false when PostHog returns false for df_busy_integration', async () => {
    mockEvaluateFlags.mockResolvedValue({
      isEnabled: vi.fn().mockReturnValue(false),
    });

    const result = await getFlag('df_busy_integration', 'tenant-456');

    expect(result).toBe(false);
  });

  it('returns false when POSTHOG_KEY is not set', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

    const result = await getFlag('df_tenant_onboarding', 'tenant-123');

    expect(result).toBe(false);
    expect(mockEvaluateFlags).not.toHaveBeenCalled();
  });

  it('caches evaluations per tenant and flag key', async () => {
    mockEvaluateFlags.mockResolvedValue({
      isEnabled: vi.fn().mockReturnValue(true),
    });

    await getFlag('df_tally_integration', 'tenant-789');
    await getFlag('df_tally_integration', 'tenant-789');

    expect(mockEvaluateFlags).toHaveBeenCalledOnce();
  });
});
