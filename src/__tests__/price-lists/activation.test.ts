import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getPriceListStatus } from '@/lib/utils';

describe('getPriceListStatus', () => {
  const now = new Date('2026-05-26T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns draft when is_active=false regardless of validity window', () => {
    expect(getPriceListStatus({
      is_active: false,
      valid_from: '2026-01-01T00:00:00Z',
      valid_to: '2027-01-01T00:00:00Z',
    })).toBe('draft');
  });

  it('returns draft when valid_from is in the future', () => {
    expect(getPriceListStatus({
      is_active: true,
      valid_from: '2027-01-01T00:00:00Z',
      valid_to: null,
    })).toBe('draft');
  });

  it('returns expired when valid_to is in the past', () => {
    expect(getPriceListStatus({
      is_active: true,
      valid_from: '2026-01-01T00:00:00Z',
      valid_to: '2026-03-01T00:00:00Z',
    })).toBe('expired');
  });

  it('returns active when in valid window', () => {
    expect(getPriceListStatus({
      is_active: true,
      valid_from: '2026-01-01T00:00:00Z',
      valid_to: '2027-01-01T00:00:00Z',
    })).toBe('active');
  });

  it('returns active when valid_from is past and no valid_to', () => {
    expect(getPriceListStatus({
      is_active: true,
      valid_from: '2026-01-01T00:00:00Z',
      valid_to: null,
    })).toBe('active');
  });

  it('expired takes precedence over draft when validity has lapsed', () => {
    expect(getPriceListStatus({
      is_active: false,
      valid_from: '2026-01-01T00:00:00Z',
      valid_to: '2026-03-01T00:00:00Z',
    })).toBe('expired');
  });
});
