import '@testing-library/jest-dom';

// Recharts ResponsiveContainer expects ResizeObserver in jsdom.
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
