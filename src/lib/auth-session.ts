export const AUTH_CONTEXTS_STORAGE_KEY = 'yukti_auth_contexts';
export const AUTH_DRAFT_STORAGE_PREFIX = 'yukti_draft_';
export const BUYER_PREVIEW_STORAGE_KEY = 'yukti_buyer_preview_token';

function clearMatchingKeys(storage: Storage | undefined, keys: string[], prefixes: string[]) {
  if (!storage) return;

  const toRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (keys.includes(key) || prefixes.some((prefix) => key.startsWith(prefix))) {
      toRemove.push(key);
    }
  }

  toRemove.forEach((key) => storage.removeItem(key));
}

export function clearAuthClientStorage() {
  if (typeof window === 'undefined') return;

  clearMatchingKeys(
    window.sessionStorage,
    [AUTH_CONTEXTS_STORAGE_KEY, BUYER_PREVIEW_STORAGE_KEY],
    [AUTH_DRAFT_STORAGE_PREFIX],
  );
  clearMatchingKeys(window.localStorage, [], [AUTH_DRAFT_STORAGE_PREFIX]);
}

export function getStoredBuyerPreviewToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(BUYER_PREVIEW_STORAGE_KEY);
}

export function setStoredBuyerPreviewToken(token: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(BUYER_PREVIEW_STORAGE_KEY, token);
}

export function clearStoredBuyerPreviewToken() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(BUYER_PREVIEW_STORAGE_KEY);
}

export function getSessionExpiredRedirectPath(pathname: string) {
  const params = new URLSearchParams({ reason: 'session_expired' });
  if (pathname.startsWith('/shop')) {
    return `/login/phone?${params.toString()}`;
  }
  return `/login?${params.toString()}`;
}

export function getPostLogoutRedirectPath(pathname: string) {
  if (pathname.startsWith('/shop')) {
    return '/login/phone';
  }
  return '/login';
}
