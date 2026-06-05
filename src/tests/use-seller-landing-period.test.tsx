import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';

describe('useSellerLandingPeriod', () => {
  it('updates the selected period locally without relying on URL navigation', () => {
    const { result } = renderHook(() => useSellerLandingPeriod('month'));

    expect(result.current.period).toBe('month');
    expect(result.current.horizonLabel).toBe('This Month');

    act(() => {
      result.current.setPeriod('quarter');
    });

    expect(result.current.period).toBe('quarter');
    expect(result.current.horizonLabel).toBe('This Quarter');
    expect(result.current.metricSuffix).toBe('QTD');
  });
});
