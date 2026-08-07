import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingleMock = vi.fn();
const isMock = vi.fn();
const eqMock = vi.fn();
const updateMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const schemaMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import {
  dismissTenantOnboardingBanner,
  getTenantOnboardingBannerState,
} from '@/lib/server/tenant-creator';

describe('tenant onboarding banner state', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    isMock.mockResolvedValue({ error: null });
    eqMock.mockImplementation(() => ({
      maybeSingle: maybeSingleMock,
      is: isMock,
    }));
    updateMock.mockImplementation(() => ({
      eq: eqMock,
    }));
    selectMock.mockImplementation(() => ({
      eq: eqMock,
    }));
    fromMock.mockImplementation(() => ({
      select: selectMock,
      update: updateMock,
    }));
    schemaMock.mockImplementation(() => ({
      from: fromMock,
    }));
  });

  it('returns creator + dismiss stamp from tenants row', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        created_by: 'user-1',
        onboarding_banner_dismissed_at: '2026-08-07T00:00:00.000Z',
      },
      error: null,
    });

    await expect(getTenantOnboardingBannerState('tenant-1', 'user-1')).resolves.toEqual({
      isTenantCreator: true,
      onboardingBannerDismissedAt: '2026-08-07T00:00:00.000Z',
    });

    await expect(getTenantOnboardingBannerState('tenant-1', 'user-2')).resolves.toEqual({
      isTenantCreator: false,
      onboardingBannerDismissedAt: '2026-08-07T00:00:00.000Z',
    });
  });

  it('stamps dismiss for creator when unset', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { created_by: 'user-1', onboarding_banner_dismissed_at: null },
      error: null,
    });

    const result = await dismissTenantOnboardingBanner('tenant-1', 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dismissedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(updateMock).toHaveBeenCalled();
  });

  it('rejects dismiss for non-creator', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { created_by: 'user-1', onboarding_banner_dismissed_at: null },
      error: null,
    });

    await expect(dismissTenantOnboardingBanner('tenant-1', 'user-2')).resolves.toEqual({
      ok: false,
      status: 403,
      message: 'Only the tenant creator can dismiss this banner',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('is idempotent when already dismissed', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        created_by: 'user-1',
        onboarding_banner_dismissed_at: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    });

    await expect(dismissTenantOnboardingBanner('tenant-1', 'user-1')).resolves.toEqual({
      ok: true,
      dismissedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
