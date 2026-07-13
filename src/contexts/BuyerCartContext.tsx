'use client';

import { createContext, useContext, useEffect, useReducer, ReactNode, useCallback, useMemo } from 'react';
import posthog from 'posthog-js';

import {
  BUYER_CART_CAMPAIGN_STORAGE_KEY,
  resolveBuyerCartCampaignId,
} from '@/lib/buyer-cart-campaign';

const STORAGE_KEY = 'yukti_buyer_cart';

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
  campaign_id?: string | null;
  stock_status?: 'available' | 'limited' | 'out_of_stock';
  on_hand?: number;
}

type CartState = { items: BuyerCartItem[]; campaignId: string | null };

type CartAction =
  | { type: 'ADD_ITEM'; item: BuyerCartItem }
  | { type: 'REMOVE_ITEM'; tenant_product_id: string }
  | { type: 'UPDATE_QTY'; tenant_product_id: string; quantity: number }
  | { type: 'CLEAR_CART' }
  | { type: 'REPLACE_ITEMS'; items: BuyerCartItem[] }
  | { type: 'SET_CAMPAIGN_ID'; campaignId: string | null };

function readInitialCartState(): CartState {
  if (typeof window === 'undefined') {
    return { items: [], campaignId: null };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const campaignRaw = localStorage.getItem(BUYER_CART_CAMPAIGN_STORAGE_KEY);
    const items = raw ? (JSON.parse(raw) as BuyerCartItem[]) : [];
    const campaignId = campaignRaw && campaignRaw !== 'null' ? campaignRaw : null;
    return {
      items: Array.isArray(items) ? items : [],
      campaignId,
    };
  } catch {
    return { items: [], campaignId: null };
  }
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
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
            ? {
                ...i,
                quantity: newQty,
                line_total: newQty * i.unit_price,
                campaign_id: action.item.campaign_id ?? i.campaign_id ?? state.campaignId,
              }
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
  resolvedCampaignId: string | null;
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
  const [state, dispatch] = useReducer(cartReducer, undefined, readInitialCartState);

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
        localStorage.setItem(BUYER_CART_CAMPAIGN_STORAGE_KEY, state.campaignId);
      } else {
        localStorage.removeItem(BUYER_CART_CAMPAIGN_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [state.campaignId]);

  const setCampaignId = useCallback((campaignId: string | null) => {
    dispatch({ type: 'SET_CAMPAIGN_ID', campaignId });
  }, []);

  const addItem = useCallback((item: BuyerCartItem, campaignId?: string | null) => {
    const effectiveCampaignId = campaignId ?? item.campaign_id ?? state.campaignId ?? null;
    const stampedItem = effectiveCampaignId
      ? { ...item, campaign_id: effectiveCampaignId }
      : item;

    if (effectiveCampaignId) {
      dispatch({ type: 'SET_CAMPAIGN_ID', campaignId: effectiveCampaignId });
    }
    dispatch({ type: 'ADD_ITEM', item: stampedItem });
    posthog.capture('catalog_item_added_to_cart', {
      tenant_product_id: item.tenant_product_id,
      product_name: item.name,
      brand: item.brand,
      unit_price: item.unit_price,
      gst_rate: item.gst_rate ?? null,
      quantity: item.quantity,
      campaign_id: effectiveCampaignId,
    });
  }, [state.campaignId]);

  const removeItem = useCallback((tenant_product_id: string) => {
    dispatch({ type: 'REMOVE_ITEM', tenant_product_id });
  }, []);

  const updateQty = useCallback((tenant_product_id: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QTY', tenant_product_id, quantity });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR_CART' });
  }, []);

  const replaceItems = useCallback((items: BuyerCartItem[]) => {
    dispatch({ type: 'REPLACE_ITEMS', items });
  }, []);

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = state.items
    .filter((item) => item.stock_status !== 'out_of_stock')
    .reduce((sum, i) => sum + i.line_total, 0);
  const resolvedCampaignId = resolveBuyerCartCampaignId(state.campaignId, state.items);

  const value = useMemo<CartContextValue>(() => ({
    items: state.items,
    campaignId: state.campaignId,
    resolvedCampaignId,
    itemCount,
    subtotal,
    setCampaignId,
    addItem,
    removeItem,
    updateQty,
    clearCart,
    replaceItems,
  }), [
    addItem,
    clearCart,
    itemCount,
    removeItem,
    replaceItems,
    resolvedCampaignId,
    setCampaignId,
    state.items,
    state.campaignId,
    subtotal,
    updateQty,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside BuyerCartProvider');
  return ctx;
}
