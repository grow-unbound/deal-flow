import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { BuyerCartProvider, useCart, type BuyerCartItem } from '@/contexts/BuyerCartContext';

vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
  },
}));

const STORAGE_KEY = 'yukti_buyer_cart';

function createStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function seedCart(storage: ReturnType<typeof createStorage>, items: BuyerCartItem[]) {
  storage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function ClearCartEffectProbe() {
  const { clearCart, items } = useCart();
  const [effectRuns, setEffectRuns] = React.useState(0);

  React.useEffect(() => {
    setEffectRuns((count) => {
      if (count >= 3) {
        throw new Error('clearCart effect loop detected');
      }
      return count + 1;
    });
    clearCart();
  }, [clearCart]);

  return (
    <div>
      <span data-testid="effect-runs">{effectRuns}</span>
      <span data-testid="item-count">{items.length}</span>
    </div>
  );
}

describe('BuyerCartProvider', () => {
  beforeEach(() => {
    const storage = createStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
  });

  it('keeps clearCart stable for effects that depend on it', async () => {
    const storage = createStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    seedCart(storage, [
      {
        tenant_product_id: 'tp-1',
        name: 'Camera',
        quantity: 1,
        line_total: 5000,
        unit_price: 5000,
      },
    ]);

    render(
      <BuyerCartProvider>
        <ClearCartEffectProbe />
      </BuyerCartProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('item-count')).toHaveTextContent('0');
    });
    expect(screen.getByTestId('effect-runs')).toHaveTextContent('1');
  });
});
