import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';

describe('navigateBuyerBack', () => {
  const originalHistoryState = window.history.state;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window.history, 'state', {
      configurable: true,
      value: originalHistoryState,
    });
  });

  it('uses browser back when the current tab has stacked history', () => {
    const router = {
      back: vi.fn(),
      replace: vi.fn(),
    };

    Object.defineProperty(window.history, 'state', {
      configurable: true,
      value: { idx: 2 },
    });

    navigateBuyerBack(router);

    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('df_buyer_nav_direction')).toBe('back');
  });

  it('falls back to buyer catalog when opened without stacked history', () => {
    const router = {
      back: vi.fn(),
      replace: vi.fn(),
    };

    Object.defineProperty(window.history, 'state', {
      configurable: true,
      value: { idx: 0 },
    });

    navigateBuyerBack(router);

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/buy/home');
    expect(window.sessionStorage.getItem('df_buyer_nav_direction')).toBe('back');
  });

  it('uses an explicit fallback when provided (catalog tree details)', () => {
    const router = {
      back: vi.fn(),
      replace: vi.fn(),
    };

    Object.defineProperty(window.history, 'state', {
      configurable: true,
      value: { idx: 0 },
    });

    navigateBuyerBack(router, '/buy/home');

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/buy/home');
  });
});
