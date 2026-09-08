import { describe, expect, it, beforeEach } from 'vitest';
import { shouldSkipConfirm, setSkipConfirm } from '@/lib/inbox/inbox-confirm-prefs';

describe('inbox-confirm-prefs', () => {
  beforeEach(() => {
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
