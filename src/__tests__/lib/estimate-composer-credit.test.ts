import { describe, expect, it } from 'vitest';

import {
  hasEstimateComposerCreditLimit,
  resolveEstimateComposerCreditPreviewPct,
  resolveEstimateComposerCreditTone,
  resolveEstimateComposerCreditUsedPct,
} from '@/types/estimate-composer';

describe('estimate composer credit headroom', () => {
  it('treats null, zero, and undefined limits as unset', () => {
    expect(hasEstimateComposerCreditLimit(null)).toBe(false);
    expect(hasEstimateComposerCreditLimit(0)).toBe(false);
    expect(hasEstimateComposerCreditLimit(undefined)).toBe(false);
    expect(hasEstimateComposerCreditLimit(5000)).toBe(true);
  });

  it('fills the bar to 100% when no credit limit is configured', () => {
    expect(resolveEstimateComposerCreditUsedPct(4500, null)).toBe(100);
    expect(resolveEstimateComposerCreditUsedPct(4500, 0)).toBe(100);
    expect(resolveEstimateComposerCreditUsedPct(0, null)).toBe(100);
  });

  it('shows used credit as a percentage of the limit', () => {
    expect(resolveEstimateComposerCreditUsedPct(2000, 20_000)).toBe(10);
    expect(resolveEstimateComposerCreditUsedPct(4500, 5000)).toBe(90);
  });

  it('caps the used fill at 100% when credit is over the limit', () => {
    expect(resolveEstimateComposerCreditUsedPct(6000, 5000)).toBe(100);
    expect(resolveEstimateComposerCreditUsedPct(5000, 5000)).toBe(100);
  });

  it('derives preview width from projected utilization', () => {
    expect(resolveEstimateComposerCreditPreviewPct(4500, 5000, 392, 90)).toBeCloseTo(7.84, 2);
    expect(resolveEstimateComposerCreditPreviewPct(4500, 5000, 2000, 90)).toBe(10);
    expect(resolveEstimateComposerCreditPreviewPct(4500, null, 392, 100)).toBe(0);
  });

  it('maps projected utilization to tone buckets', () => {
    expect(resolveEstimateComposerCreditTone(2000, 20_000, 1000)).toBe('success');
    expect(resolveEstimateComposerCreditTone(4500, 5000, 392)).toBe('warning');
    expect(resolveEstimateComposerCreditTone(4500, 5000, 2000)).toBe('danger');
    expect(resolveEstimateComposerCreditTone(1000, null, 0)).toBe('danger');
    expect(resolveEstimateComposerCreditTone(0, null, 0)).toBe('success');
  });
});
