import { describe, expect, it } from 'vitest';

import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { parseSellerLandingPeriod, sellerLandingMetricSuffix } from '@/lib/seller-period';

describe('seller period helpers', () => {
  const now = new Date('2026-06-14T10:30:00.000Z');

  it('parses the expanded seller landing period options', () => {
    expect(parseSellerLandingPeriod('today')).toBe('today');
    expect(parseSellerLandingPeriod('week')).toBe('week');
    expect(parseSellerLandingPeriod('month')).toBe('month');
    expect(parseSellerLandingPeriod('quarter')).toBe('quarter');
    expect(parseSellerLandingPeriod('year')).toBe('year');
    expect(parseSellerLandingPeriod('nope')).toBe('month');
  });

  it('returns expected date windows for today', () => {
    const period = getSellerLandingPeriodMeta('today', now);

    expect(period.current_start).toBe('2026-06-14T00:00:00.000Z');
    expect(period.current_end_exclusive).toBe('2026-06-15T00:00:00.000Z');
    expect(period.previous_start).toBe('2026-06-13T00:00:00.000Z');
    expect(period.previous_end_exclusive).toBe('2026-06-14T00:00:00.000Z');
    expect(period.elapsed_days).toBe(1);
  });

  it('returns expected date windows for this week', () => {
    const period = getSellerLandingPeriodMeta('week', now);

    expect(period.current_start).toBe('2026-06-08T00:00:00.000Z');
    expect(period.current_end_exclusive).toBe('2026-06-15T00:00:00.000Z');
    expect(period.previous_start).toBe('2026-06-01T00:00:00.000Z');
    expect(period.previous_end_exclusive).toBe('2026-06-08T00:00:00.000Z');
    expect(period.elapsed_days).toBe(7);
  });

  it('returns expected date windows for month, quarter, and year', () => {
    const month = getSellerLandingPeriodMeta('month', now);
    const quarter = getSellerLandingPeriodMeta('quarter', now);
    const year = getSellerLandingPeriodMeta('year', now);

    expect(month.current_start).toBe('2026-06-01T00:00:00.000Z');
    expect(month.previous_start).toBe('2026-05-01T00:00:00.000Z');
    expect(month.elapsed_days).toBe(14);

    expect(quarter.current_start).toBe('2026-04-01T00:00:00.000Z');
    expect(quarter.previous_start).toBe('2026-01-01T00:00:00.000Z');
    expect(quarter.elapsed_days).toBeGreaterThan(70);

    expect(year.current_start).toBe('2026-01-01T00:00:00.000Z');
    expect(year.previous_start).toBe('2025-01-01T00:00:00.000Z');
    expect(year.elapsed_days).toBeGreaterThan(160);
  });

  it('returns the correct metric suffix for each period', () => {
    expect(sellerLandingMetricSuffix('today')).toBe('TODAY');
    expect(sellerLandingMetricSuffix('week')).toBe('WTD');
    expect(sellerLandingMetricSuffix('month')).toBe('MTD');
    expect(sellerLandingMetricSuffix('quarter')).toBe('QTD');
    expect(sellerLandingMetricSuffix('year')).toBe('YTD');
  });
});
