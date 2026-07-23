import { beforeEach, describe, expect, it } from 'vitest';

import {
  BUYER_APP_DISABLE_CONFIRM_SKIP_COOKIE,
  BUYER_APP_ENABLE_CONFIRM_SKIP_COOKIE,
  isBuyerAppDisableConfirmSkipped,
  isBuyerAppEnableConfirmSkipped,
  setBuyerAppDisableConfirmSkipped,
  setBuyerAppEnableConfirmSkipped,
} from '@/lib/buyer-app-access-confirm';

describe('buyer-app-access-confirm cookies', () => {
  beforeEach(() => {
    document.cookie = `${BUYER_APP_ENABLE_CONFIRM_SKIP_COOKIE}=; Max-Age=0; path=/`;
    document.cookie = `${BUYER_APP_DISABLE_CONFIRM_SKIP_COOKIE}=; Max-Age=0; path=/`;
  });

  it('tracks enable and disable skip flags independently', () => {
    expect(isBuyerAppEnableConfirmSkipped()).toBe(false);
    expect(isBuyerAppDisableConfirmSkipped()).toBe(false);

    setBuyerAppEnableConfirmSkipped();
    expect(isBuyerAppEnableConfirmSkipped()).toBe(true);
    expect(isBuyerAppDisableConfirmSkipped()).toBe(false);

    setBuyerAppDisableConfirmSkipped();
    expect(isBuyerAppDisableConfirmSkipped()).toBe(true);
  });
});
