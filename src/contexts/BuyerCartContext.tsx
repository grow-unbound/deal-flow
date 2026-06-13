'use client';

import { createContext, useContext, useEffect, useReducer, ReactNode } from 'react';
import posthog from 'posthog-js';

const STORAGE_KEY = 'yukti_buyer_cart';

export interface BuyerCartItem {
  tenant_product_id: string;
  name: string;
  brand?: string;
  internal_sku?: string;
  image_url?: string;
  unit_price: number;
  unit?: string;
  quantity: number;
  line_total: number;
}

type CartState = { items: BuyerCartItem[] };

type CartAction =
  | { type: 'ADD_ITEM'; item: BuyerCartItem }
  | { type: 'REMOVE_ITEM'; tenant_product_id: string }
  | { type: 'UPDATE_QTY'; tenant_product_id: string; quantity: number }
  | { type: 'CLEAR_CART' }
  | { type: 'HYDRATE'; items: BuyerCartItem[] };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items };

    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.tenant_product_id === action.item.tenant_product_id);
      if (existing) {
        const newQty = existing.quantity + action.item.quantity;
        return {
          items: state.items.map((i) =>
            i.tenant_product_id === action.item.tenant_product_id
              ? { ...i, quantity: newQty, line_total: newQty * i.unit_price }
              : i
          ),
        };
      }
      return { items: [...state.items, action.item] };
    }

    case 'REMOVE_ITEM':
      return { items: state.items.filter((i) => i.tenant_product_id !== action.tenant_product_id) };

    case 'UPDATE_QTY': {
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => i.tenant_product_id !== action.tenant_product_id) };
      }
      return {
        items: state.items.map((i) =>
          i.tenant_product_id === action.tenant_product_id
            ? { ...i, quantity: action.quantity, line_total: action.quantity * i.unit_price }
            : i
        ),
      };
    }

    case 'CLEAR_CART':
      return { items: [] };

    default:
      return state;
  }
}

export interface CartContextValue {
  items: BuyerCartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (item: BuyerCartItem) => void;
  removeItem: (tenant_product_id: string) => void;
  updateQty: (tenant_product_id: string, quantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function BuyerCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const items = JSON.parse(raw) as BuyerCartItem[];
        if (Array.isArray(items)) dispatch({ type: 'HYDRATE', items });
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // ignore storage errors
    }
  }, [state.items]);

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = state.items.reduce((sum, i) => sum + i.line_total, 0);

  const value: CartContextValue = {
    items: state.items,
    itemCount,
    subtotal,
    addItem: (item) => {
      dispatch({ type: 'ADD_ITEM', item });
      posthog.capture('catalog_item_added_to_cart', {
        tenant_product_id: item.tenant_product_id,
        product_name: item.name,
        brand: item.brand,
        unit_price: item.unit_price,
        quantity: item.quantity,
      });
    },
    removeItem: (tenant_product_id) => dispatch({ type: 'REMOVE_ITEM', tenant_product_id }),
    updateQty: (tenant_product_id, quantity) => dispatch({ type: 'UPDATE_QTY', tenant_product_id, quantity }),
    clearCart: () => dispatch({ type: 'CLEAR_CART' }),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside BuyerCartProvider');
  return ctx;
}
