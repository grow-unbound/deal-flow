import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prefetchMock = vi.fn();
const usePathnameMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: prefetchMock }),
  usePathname: () => usePathnameMock(),
}));

import { useIdleRoutePrefetch } from '@/hooks/useIdleRoutePrefetch';

describe('useIdleRoutePrefetch', () => {
  beforeEach(() => {
    prefetchMock.mockReset();
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue('/shop/catalog');
    vi.useFakeTimers();
  });

  it('prefetches only non-active routes and does not repeat on rerender', () => {
    const { rerender } = renderHook(() =>
      useIdleRoutePrefetch(['/shop/home', '/shop/catalog', '/shop/orders']),
    );

    vi.runAllTimers();

    expect(prefetchMock).toHaveBeenCalledTimes(2);
    expect(prefetchMock).toHaveBeenNthCalledWith(1, '/shop/home');
    expect(prefetchMock).toHaveBeenNthCalledWith(2, '/shop/orders');

    rerender();
    vi.runAllTimers();

    expect(prefetchMock).toHaveBeenCalledTimes(2);
  });
});
