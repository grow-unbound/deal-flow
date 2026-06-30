export const AUTH_CONTEXTS_STORAGE_KEY = 'yukti_auth_contexts';
export const AUTH_DRAFT_STORAGE_PREFIX = 'yukti_draft_';

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
    [AUTH_CONTEXTS_STORAGE_KEY],
    [AUTH_DRAFT_STORAGE_PREFIX],
  );
  clearMatchingKeys(window.localStorage, [], [AUTH_DRAFT_STORAGE_PREFIX]);
}

export function getSessionExpiredRedirectPath(_pathname: string) {
  return '/login';
}

export function getPostLogoutRedirectPath(_pathname: string) {
  return '/login';
}
