export const AUTH_CONTEXTS_STORAGE_KEY = 'dealflow_auth_contexts';
export const AUTH_DRAFT_STORAGE_PREFIX = 'dealflow_draft_';

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

  clearMatchingKeys(window.sessionStorage, [AUTH_CONTEXTS_STORAGE_KEY], [AUTH_DRAFT_STORAGE_PREFIX]);
  clearMatchingKeys(window.localStorage, [], [AUTH_DRAFT_STORAGE_PREFIX]);
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
