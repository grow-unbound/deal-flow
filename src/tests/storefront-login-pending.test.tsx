import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
let cachedMe: unknown;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ getQueryData: () => cachedMe }) }));

describe('StorefrontLogin openLogin for pending buyers', () => {
  beforeEach(() => pushMock.mockReset());

  async function openLogin() {
    const { StorefrontLoginProvider, useStorefrontLogin } = await import('@/contexts/StorefrontLoginContext');
    const { result } = renderHook(() => useStorefrontLogin(), { wrapper: StorefrontLoginProvider });
    act(() => result.current.openLogin());
    return result;
  }

  it('routes a needs_more_info buyer to /resubmit-documents', async () => {
    cachedMe = { mode: 'pending', pending: { onboarding_status: 'needs_more_info', intake_submitted: false } };
    await openLogin();
    expect(pushMock).toHaveBeenCalledWith('/resubmit-documents');
  });

  it('routes an intake-complete pending buyer to /pending', async () => {
    cachedMe = { mode: 'pending', pending: { onboarding_status: 'pending_approval', intake_submitted: true } };
    await openLogin();
    expect(pushMock).toHaveBeenCalledWith('/pending');
  });
});
