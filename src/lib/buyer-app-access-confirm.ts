const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const BUYER_APP_ENABLE_CONFIRM_SKIP_COOKIE = 'buyer_app_enable_confirm_skip';
export const BUYER_APP_DISABLE_CONFIRM_SKIP_COOKIE = 'buyer_app_disable_confirm_skip';

function readCookieFlag(cookieName: string): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.includes(`${cookieName}=1`);
}

function writeCookieFlag(cookieName: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${cookieName}=1; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function isBuyerAppEnableConfirmSkipped(): boolean {
  return readCookieFlag(BUYER_APP_ENABLE_CONFIRM_SKIP_COOKIE);
}

export function setBuyerAppEnableConfirmSkipped(): void {
  writeCookieFlag(BUYER_APP_ENABLE_CONFIRM_SKIP_COOKIE);
}

export function isBuyerAppDisableConfirmSkipped(): boolean {
  return readCookieFlag(BUYER_APP_DISABLE_CONFIRM_SKIP_COOKIE);
}

export function setBuyerAppDisableConfirmSkipped(): void {
  writeCookieFlag(BUYER_APP_DISABLE_CONFIRM_SKIP_COOKIE);
}
