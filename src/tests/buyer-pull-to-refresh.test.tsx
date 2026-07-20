import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BuyerPullToRefresh } from '@/components/buyer/layout/BuyerPullToRefresh';
import { isBuyerRefreshQueryKey } from '@/lib/buyer-refresh';

function makeTouchEvent(type: 'touchStart' | 'touchMove', clientX: number, clientY: number) {
  return {
    touches: [{ clientX, clientY }],
    changedTouches: [{ clientX, clientY }],
  };
}

describe('buyer pull to refresh', () => {
  it('fires refresh after a full downward pull from the top', async () => {
    let resolveRefresh: (() => void) | null = null;
    const onRefresh = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    }));

    render(
      <BuyerPullToRefresh onRefresh={onRefresh}>
        <div style={{ height: 400 }}>Body</div>
      </BuyerPullToRefresh>,
    );

    const viewport = screen.getByText('Body').parentElement?.parentElement;
    expect(viewport).toBeTruthy();
    Object.defineProperty(viewport as HTMLDivElement, 'scrollTop', { value: 0, configurable: true });

    fireEvent.touchStart(viewport as HTMLDivElement, makeTouchEvent('touchStart', 0, 0));
    fireEvent.touchMove(viewport as HTMLDivElement, makeTouchEvent('touchMove', 0, 180));
    fireEvent.touchEnd(viewport as HTMLDivElement);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Refreshing')).toBeInTheDocument();
    resolveRefresh?.();
  });

  it('does not refresh when the pull is too short', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(
      <BuyerPullToRefresh onRefresh={onRefresh}>
        <div style={{ height: 400 }}>Body</div>
      </BuyerPullToRefresh>,
    );

    const viewport = screen.getByText('Body').parentElement?.parentElement;
    expect(viewport).toBeTruthy();
    Object.defineProperty(viewport as HTMLDivElement, 'scrollTop', { value: 0, configurable: true });

    fireEvent.touchStart(viewport as HTMLDivElement, makeTouchEvent('touchStart', 0, 0));
    fireEvent.touchMove(viewport as HTMLDivElement, makeTouchEvent('touchMove', 0, 40));
    fireEvent.touchEnd(viewport as HTMLDivElement);

    await waitFor(() => expect(onRefresh).not.toHaveBeenCalled());
  });
});

describe('buyer refresh query selection', () => {
  it('matches buyer-facing active keys and skips seller keys', () => {
    expect(isBuyerRefreshQueryKey(['buyer-home'])).toBe(true);
    expect(isBuyerRefreshQueryKey(['buyer-catalog-search', 'camera'])).toBe(true);
    expect(isBuyerRefreshQueryKey(['cart-bundles'])).toBe(true);
    expect(isBuyerRefreshQueryKey(['reco-category', 'cat-1'])).toBe(true);
    expect(isBuyerRefreshQueryKey(['tenant-orders'])).toBe(false);
  });
});
