'use client';

import { createContext, useContext, useEffect, useReducer, ReactNode, useCallback } from 'react';
import posthog from 'posthog-js';

const STORAGE_KEY = 'yukti_buyer_cart';
const CAMPAIGN_STORAGE_KEY = 'yukti_buyer_cart_campaign';

export interface BuyerCartItem {
  tenant_product_id: string;
  name: string;
  brand?: string;
  internal_sku?: string;
  image_url?: string;
  unit_price: number;
  gst_rate?: number | null;
  unit?: string;
  quantity: number;
  line_total: number;
  tenant_category_id?: string;
}

type CartState = { items: BuyerCartItem[]; campaignId: string | null };

type CartAction =
  | { type: 'ADD_ITEM'; item: BuyerCartItem }
  | { type: 'REMOVE_ITEM'; tenant_product_id: string }
  | { type: 'UPDATE_QTY'; tenant_product_id: string; quantity: number }
  | { type: 'CLEAR_CART' }
  | { type: 'REPLACE_ITEMS'; items: BuyerCartItem[] }
  | { type: 'HYDRATE'; items: BuyerCartItem[]; campaignId: string | null }
  | { type: 'SET_CAMPAIGN_ID'; campaignId: string | null };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items, campaignId: action.campaignId };

    case 'SET_CAMPAIGN_ID':
      return { ...state, campaignId: action.campaignId };

    case 'REPLACE_ITEMS':
      return { ...state, items: action.items };

    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.tenant_product_id === action.item.tenant_product_id);
      if (existing) {
        const newQty = existing.quantity + action.item.quantity;
        return {
          ...state,
          items: state.items.map((i) =>
            i.tenant_product_id === action.item.tenant_product_id
            ? { ...i, quantity: newQty, line_total: newQty * i.unit_price }
              : i
          ),
        };
      }
      return { ...state, items: [...state.items, action.item] };
    }

    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.tenant_product_id !== action.tenant_product_id) };

    case 'UPDATE_QTY': {
      if (action.quantity <= 0) {
        return { ...state, items: state.items.filter((i) => i.tenant_product_id !== action.tenant_product_id) };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.tenant_product_id === action.tenant_product_id
            ? { ...i, quantity: action.quantity, line_total: action.quantity * i.unit_price }
            : i
        ),
      };
    }

    case 'CLEAR_CART':
      return { items: [], campaignId: null };

    default:
      return state;
  }
}

export interface CartContextValue {
  items: BuyerCartItem[];
  campaignId: string | null;
  itemCount: number;
  subtotal: number;
  setCampaignId: (campaignId: string | null) => void;
  addItem: (item: BuyerCartItem, campaignId?: string | null) => void;
  removeItem: (tenant_product_id: string) => void;
  updateQty: (tenant_product_id: string, quantity: number) => void;
  clearCart: () => void;
  replaceItems: (items: BuyerCartItem[]) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function BuyerCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], campaignId: null });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const campaignRaw = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
      const items = raw ? (JSON.parse(raw) as BuyerCartItem[]) : [];
      const campaignId = campaignRaw && campaignRaw !== 'null' ? campaignRaw : null;
      if (Array.isArray(items)) dispatch({ type: 'HYDRATE', items, campaignId });
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

  useEffect(() => {
    try {
      if (state.campaignId) {
        localStorage.setItem(CAMPAIGN_STORAGE_KEY, state.campaignId);
      } else {
        localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [state.campaignId]);

  const setCampaignId = useCallback((campaignId: string | null) => {
    dispatch({ type: 'SET_CAMPAIGN_ID', campaignId });
  }, []);

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = state.items.reduce((sum, i) => sum + i.line_total, 0);

  const value: CartContextValue = {
    items: state.items,
    campaignId: state.campaignId,
    itemCount,
    subtotal,
    setCampaignId,
    addItem: (item, campaignId) => {
      if (campaignId) {
        dispatch({ type: 'SET_CAMPAIGN_ID', campaignId });
      }
      dispatch({ type: 'ADD_ITEM', item });
      posthog.capture('catalog_item_added_to_cart', {
        tenant_product_id: item.tenant_product_id,
        product_name: item.name,
        brand: item.brand,
        unit_price: item.unit_price,
        gst_rate: item.gst_rate ?? null,
        quantity: item.quantity,
      });
    },
    removeItem: (tenant_product_id) => dispatch({ type: 'REMOVE_ITEM', tenant_product_id }),
    updateQty: (tenant_product_id, quantity) => dispatch({ type: 'UPDATE_QTY', tenant_product_id, quantity }),
    clearCart: () => dispatch({ type: 'CLEAR_CART' }),
    replaceItems: (items) => dispatch({ type: 'REPLACE_ITEMS', items }),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside BuyerCartProvider');
  return ctx;
}
