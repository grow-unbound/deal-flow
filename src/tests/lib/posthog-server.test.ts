import { beforeEach, describe, expect, it, vi } from 'vitest';

const groupIdentifyMock = vi.fn();
const flushMock = vi.fn();

vi.mock('posthog-node', () => ({
  PostHog: function PostHog() {
    return {
      groupIdentify: groupIdentifyMock,
      flush: flushMock,
    };
  },
}));

import { FEATURE_FLAGS } from '@/constants';
import { buildDefaultTenantFeatureFlags, seedTenantFeatureFlags } from '@/lib/posthog-server';

describe('posthog tenant flag seeding', () => {
  beforeEach(() => {
    groupIdentifyMock.mockClear();
    flushMock.mockClear();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key';
  });

  it('builds an all-false payload for every tenant-scoped flag', () => {
    const flags = buildDefaultTenantFeatureFlags();
    const expectedFlagNames = Object.entries(FEATURE_FLAGS)
      .filter(([key]) => key !== 'TENANT_ONBOARDING')
      .map(([, value]) => value);

    expect(Object.keys(flags).sort()).toEqual([...expectedFlagNames].sort());
    for (const flagName of expectedFlagNames) {
      expect(flags[flagName as keyof typeof flags]).toBe(false);
    }
  });

  it('seeds PostHog group properties for a new tenant', async () => {
    await seedTenantFeatureFlags('tenant-123');

    expect(groupIdentifyMock).toHaveBeenCalledTimes(1);
    expect(groupIdentifyMock).toHaveBeenCalledWith({
      groupType: 'tenant',
      groupKey: 'tenant-123',
      properties: buildDefaultTenantFeatureFlags(),
    });
    expect(flushMock).toHaveBeenCalledTimes(1);
  });
});
