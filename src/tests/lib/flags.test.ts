import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIsFeatureEnabled = vi.fn();
const mockShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock('posthog-node', () => ({
  PostHog: function PostHog() {
    return {
      isFeatureEnabled: mockIsFeatureEnabled,
      shutdown: mockShutdown,
    };
  },
}));

import { getFlag } from '@/lib/flags';

beforeEach(() => {
  vi.clearAllMocks();
  mockShutdown.mockResolvedValue(undefined);
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key';
});

describe('getFlag', () => {
  it('returns false for unknown flag name when PostHog returns undefined', async () => {
    mockIsFeatureEnabled.mockResolvedValue(undefined);

    const result = await getFlag('unknown_flag_xyz', 'tenant-123');

    expect(result).toBe(false);
  });

  it('returns true when PostHog returns true for a known flag', async () => {
    mockIsFeatureEnabled.mockResolvedValue(true);

    const result = await getFlag('df_tenant_onboarding', 'tenant-123');

    expect(result).toBe(true);
  });

  it('returns false when PostHog returns false for a known flag', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);

    const result = await getFlag('df_brand_product_master', 'tenant-456');

    expect(result).toBe(false);
  });

  it('returns false when POSTHOG_KEY is not set', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

    const result = await getFlag('df_tenant_onboarding', 'tenant-123');

    expect(result).toBe(false);
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
  });

  it('shuts down the client after each call', async () => {
    mockIsFeatureEnabled.mockResolvedValue(true);

    await getFlag('df_cohorts', 'tenant-789');

    expect(mockShutdown).toHaveBeenCalledOnce();
  });
});
