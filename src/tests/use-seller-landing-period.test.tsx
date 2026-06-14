import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';

describe('useSellerLandingPeriod', () => {
  it('updates the selected period locally without relying on URL navigation', () => {
    const { result } = renderHook(() => useSellerLandingPeriod('month'));

    expect(result.current.period).toBe('month');
    expect(result.current.horizonLabel).toBe('This Month');
    expect(result.current.options.map((option) => option.value)).toEqual(['today', 'week', 'month', 'quarter', 'year']);

    act(() => {
      result.current.setPeriod('week');
    });

    expect(result.current.period).toBe('week');
    expect(result.current.horizonLabel).toBe('This Week');
    expect(result.current.metricSuffix).toBe('WTD');
  });
});
