import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Recharts ResponsiveContainer expects ResizeObserver in jsdom.
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// jsdom has no matchMedia. Emulate a 1024px-wide desktop viewport for min/max-width queries
// (components using useIsMobile & friends default to desktop in tests, matching production first paint).
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const VIEWPORT_WIDTH = 1024;
  const evaluate = (query: string): boolean => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    if (min && VIEWPORT_WIDTH < Number(min[1])) return false;
    if (max && VIEWPORT_WIDTH > Number(max[1])) return false;
    return Boolean(min || max);
  };
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: evaluate(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Analytics identity hooks read AuthProvider/react-query; most component tests render without those providers.
// Default to anonymous ids; a test that cares can still vi.mock this module itself (per-file mocks win).
vi.mock('@/lib/analytics-identity', () => ({
  useSellerAnalyticsIds: () => ({ seller_id: null, tenant_id: null }),
  useBuyerAnalyticsIds: () => ({ buyer_id: null, tenant_id: null }),
}));
