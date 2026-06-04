import { describe, expect, it } from 'vitest';

import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { parseSellerLandingPeriod } from '@/lib/seller-period';

describe('seller landing period helpers', () => {
  it('defaults invalid values to month', () => {
    expect(parseSellerLandingPeriod('invalid')).toBe('month');
  });

  it('builds month boundaries with aligned previous window', () => {
    const period = getSellerLandingPeriodMeta('month', new Date('2026-06-03T08:00:00.000Z'));

    expect(period.selected).toBe('month');
    expect(period.current_start).toBe('2026-06-01T00:00:00.000Z');
    expect(period.current_end_exclusive).toBe('2026-07-01T00:00:00.000Z');
    expect(period.previous_start).toBe('2026-05-01T00:00:00.000Z');
    expect(period.previous_end_exclusive).toBe('2026-05-04T00:00:00.000Z');
    expect(period.elapsed_days).toBe(3);
  });

  it('builds quarter boundaries with aligned previous window', () => {
    const period = getSellerLandingPeriodMeta('quarter', new Date('2026-06-03T08:00:00.000Z'));

    expect(period.selected).toBe('quarter');
    expect(period.current_start).toBe('2026-04-01T00:00:00.000Z');
    expect(period.current_end_exclusive).toBe('2026-07-01T00:00:00.000Z');
    expect(period.previous_start).toBe('2026-01-01T00:00:00.000Z');
    expect(period.previous_end_exclusive).toBe('2026-03-06T00:00:00.000Z');
    expect(period.elapsed_days).toBe(64);
  });

  it('builds year boundaries with aligned previous window', () => {
    const period = getSellerLandingPeriodMeta('year', new Date('2026-06-03T08:00:00.000Z'));

    expect(period.selected).toBe('year');
    expect(period.current_start).toBe('2026-01-01T00:00:00.000Z');
    expect(period.current_end_exclusive).toBe('2027-01-01T00:00:00.000Z');
    expect(period.previous_start).toBe('2025-01-01T00:00:00.000Z');
    expect(period.previous_end_exclusive).toBe('2025-06-04T00:00:00.000Z');
    expect(period.elapsed_days).toBe(154);
  });
});
