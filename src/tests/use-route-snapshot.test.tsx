import React, { useEffect } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/buy/home',
}));

import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';

describe('useRouteSnapshot', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('keeps callback identities stable across rerenders for the same route key', () => {
    const { result, rerender } = renderHook(() =>
      useRouteSnapshot({
        storageKey: 'buyer-catalog-page',
        initialState: { search: '', page: 0 },
      }),
    );

    const initialSetState = result.current.setState;
    const initialClearState = result.current.clearState;

    rerender();

    expect(result.current.setState).toBe(initialSetState);
    expect(result.current.clearState).toBe(initialClearState);
  });

  it('does not retrigger effects that depend on setState during unrelated rerenders', () => {
    const effectSpy = vi.fn();

    function Harness({ tick }: { tick: number }) {
      const { setState } = useRouteSnapshot({
        storageKey: 'buyer-orders-page',
        initialState: { loading: true },
      });

      useEffect(() => {
        effectSpy();
      }, [setState]);

      return <div data-testid="tick">{tick}</div>;
    }

    const { rerender } = render(<Harness tick={0} />);

    expect(effectSpy).toHaveBeenCalledTimes(1);

    rerender(<Harness tick={1} />);
    rerender(<Harness tick={2} />);

    expect(effectSpy).toHaveBeenCalledTimes(1);
  });

  it('still updates state correctly through the memoized setter', () => {
    const { result } = renderHook(() =>
      useRouteSnapshot({
        storageKey: 'buyer-home-page',
        initialState: { count: 0 },
      }),
    );

    act(() => {
      result.current.setState((current) => ({ count: current.count + 1 }));
    });

    expect(result.current.state.count).toBe(1);
  });
});
