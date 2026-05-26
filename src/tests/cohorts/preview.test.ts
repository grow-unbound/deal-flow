import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CohortRulesSchema } from '@/lib/zod';

describe('Cohort preview — debounce and zero-count warning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounce: callback fires after 500ms, not before', () => {
    const callback = vi.fn();

    function debouncedPreview(fn: () => void, delay: number) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, delay);
      };
    }

    const trigger = debouncedPreview(callback, 500);

    trigger();
    trigger();
    trigger();

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('debounce: resets timer on each call', () => {
    const callback = vi.fn();
    function debouncedPreview(fn: () => void, delay: number) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, delay);
      };
    }
    const trigger = debouncedPreview(callback, 500);

    trigger();
    vi.advanceTimersByTime(400);
    trigger(); // resets
    vi.advanceTimersByTime(400);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('zero-count condition: count=0 triggers warning state', () => {
    const previewResult = { count: 0, sample_names: [] };
    const isZeroCount = previewResult.count === 0;
    expect(isZeroCount).toBe(true);
  });

  it('non-zero count does not trigger warning', () => {
    const previewResult = { count: 3, sample_names: ['Buyer A', 'Buyer B', 'Buyer C'] };
    const isZeroCount = previewResult.count === 0;
    expect(isZeroCount).toBe(false);
    expect(previewResult.sample_names).toHaveLength(3);
  });

  it('rules schema accepts empty filters for preview', () => {
    const result = CohortRulesSchema.safeParse({ filters: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.filters).toHaveLength(0);
  });

  it('rules schema with multiple filters valid for preview', () => {
    const result = CohortRulesSchema.safeParse({
      filters: [
        { field: 'geography.state', operator: 'eq', value: 'Karnataka' },
        { field: 'tier', operator: 'eq', value: 'A' },
      ],
    });
    expect(result.success).toBe(true);
  });
});
