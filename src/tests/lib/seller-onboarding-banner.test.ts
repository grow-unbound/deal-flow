import { describe, expect, it } from 'vitest';

import {
  shouldShowTenantOnboardingBanner,
  tenantFirstRunStorageKey,
} from '@/lib/seller-onboarding-banner';

describe('seller-onboarding-banner', () => {
  it('scopes localStorage key per tenant', () => {
    expect(tenantFirstRunStorageKey('tenant-a')).toBe('df_first_run:tenant-a');
  });

  it('hides for non-creators', () => {
    expect(
      shouldShowTenantOnboardingBanner({
        isTenantCreator: false,
        tenantId: 'tenant-a',
        firstRunParam: '1',
        storageSeen: false,
      }),
    ).toBe(false);
  });

  it('shows for creator on first_run', () => {
    expect(
      shouldShowTenantOnboardingBanner({
        isTenantCreator: true,
        tenantId: 'tenant-a',
        firstRunParam: '1',
        storageSeen: true,
      }),
    ).toBe(true);
  });

  it('shows for creator until tenant storage is marked seen', () => {
    expect(
      shouldShowTenantOnboardingBanner({
        isTenantCreator: true,
        tenantId: 'tenant-a',
        firstRunParam: null,
        storageSeen: false,
      }),
    ).toBe(true);

    expect(
      shouldShowTenantOnboardingBanner({
        isTenantCreator: true,
        tenantId: 'tenant-a',
        firstRunParam: null,
        storageSeen: true,
      }),
    ).toBe(false);
  });
});
