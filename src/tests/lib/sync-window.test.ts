import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveSyncWindowSince } from '@/lib/integrations/sync-window';

describe('resolveSyncWindowSince', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps the last 24 hours window to the previous date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T10:30:00.000Z'));

    expect(resolveSyncWindowSince('last_24_hours')).toBe('2026-06-22');
  });

  it('maps the last 7 days window to one week earlier', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T10:30:00.000Z'));

    expect(resolveSyncWindowSince('last_7_days')).toBe('2026-06-16');
  });

  it('maps year to date to January 1 of the current year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T10:30:00.000Z'));

    expect(resolveSyncWindowSince('year_to_date')).toBe('2026-01-01');
  });

  it('maps financial year to date to the April 1 boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T10:30:00.000Z'));

    expect(resolveSyncWindowSince('financial_year_to_date')).toBe('2026-04-01');
  });
});
