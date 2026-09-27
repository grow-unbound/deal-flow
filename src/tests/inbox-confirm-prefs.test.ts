import { describe, expect, it, beforeEach } from 'vitest';
import { shouldSkipConfirm, setSkipConfirm } from '@/lib/inbox/inbox-confirm-prefs';

function ensureLocalStorage() {
  if (window.localStorage) return;
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      clear: () => store.clear(),
    },
  });
}

describe('inbox-confirm-prefs', () => {
  beforeEach(() => {
    ensureLocalStorage();
    window.localStorage.clear();
  });

  it('defaults to not skipping', () => {
    expect(shouldSkipConfirm('t1', 'decline')).toBe(false);
  });

  it('remembers a skip choice per tenant + action', () => {
    setSkipConfirm('t1', 'decline');
    expect(shouldSkipConfirm('t1', 'decline')).toBe(true);
    expect(shouldSkipConfirm('t1', 'reject')).toBe(false);
    expect(shouldSkipConfirm('t2', 'decline')).toBe(false);
  });
});
