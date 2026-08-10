import { describe, expect, it } from 'vitest';

import { shouldShowTenantOnboardingBanner } from '@/lib/seller-onboarding-banner';

describe('seller-onboarding-banner', () => {
  it('hides for non-creators', () => {
    expect(
      shouldShowTenantOnboardingBanner({
        isTenantCreator: false,
        tenantId: 'tenant-a',
        dismissedAt: null,
      }),
    ).toBe(false);
  });

  it('hides without tenantId', () => {
    expect(
      shouldShowTenantOnboardingBanner({
        isTenantCreator: true,
        tenantId: null,
        dismissedAt: null,
      }),
    ).toBe(false);
  });

  it('shows for creator until dismissed in DB', () => {
    expect(
      shouldShowTenantOnboardingBanner({
        isTenantCreator: true,
        tenantId: 'tenant-a',
        dismissedAt: null,
      }),
    ).toBe(true);

    expect(
      shouldShowTenantOnboardingBanner({
        isTenantCreator: true,
        tenantId: 'tenant-a',
        dismissedAt: '2026-08-07T00:00:00.000Z',
      }),
    ).toBe(false);
  });
});
