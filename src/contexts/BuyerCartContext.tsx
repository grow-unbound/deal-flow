'use client';

import { createContext, useContext, useEffect, useReducer, ReactNode, useCallback, useMemo, useRef } from 'react';
import { usePostHog } from 'posthog-js/react';

import { useBuyerAnalyticsIds } from '@/lib/analytics-identity';
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
  resolved_price?: number | null;
  has_campaign_price?: boolean;
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
type CartAnalyticsContext = {
  source_surface?: string;
  source_widget?: string | null;
  source_product_id?: string | null;
  source_document_type?: string | null;
};

type CartAction =
  | { type: 'ADD_ITEM'; item: BuyerCartItem }
  | { type: 'REMOVE_ITEM'; tenant_product_id: string }
  | { type: 'REMOVE_ITEMS'; tenant_product_ids: string[] }
  | { type: 'UPDATE_QTY'; tenant_product_id: string; quantity: number }
  | { type: 'CLEAR_CART' }
  | { type: 'REPLACE_ITEMS'; items: BuyerCartItem[] }
  | { type: 'SET_CAMPAIGN_ID'; campaignId: string | null }
  | { type: 'HYDRATE'; state: CartState };

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
    case 'HYDRATE':
      return action.state;

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

    case 'REMOVE_ITEMS':
      return { ...state, items: state.items.filter((i) => !action.tenant_product_ids.includes(i.tenant_product_id)) };

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

function getItemsAfterAdd(items: BuyerCartItem[], item: BuyerCartItem, campaignId: string | null): BuyerCartItem[] {
  const existing = items.find((i) => i.tenant_product_id === item.tenant_product_id);
  if (!existing) return [...items, item];

  const newQty = existing.quantity + item.quantity;
  return items.map((i) =>
    i.tenant_product_id === item.tenant_product_id
      ? {
          ...i,
          quantity: newQty,
          line_total: newQty * i.unit_price,
          campaign_id: item.campaign_id ?? i.campaign_id ?? campaignId,
        }
      : i,
  );
}

function getItemsAfterQtyUpdate(items: BuyerCartItem[], tenantProductId: string, quantity: number): BuyerCartItem[] {
  if (quantity <= 0) return items.filter((i) => i.tenant_product_id !== tenantProductId);

  return items.map((i) =>
    i.tenant_product_id === tenantProductId
      ? { ...i, quantity, line_total: quantity * i.unit_price }
      : i,
  );
}

function getCartAnalyticsSnapshot(items: BuyerCartItem[], campaignId: string | null) {
  const sellableItems = items.filter((item) => item.stock_status !== 'out_of_stock');
  return {
    cart_line_count: items.length,
    cart_item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    cart_total_amount: sellableItems.reduce((sum, item) => sum + item.line_total, 0),
    cart_unavailable_line_count: items.length - sellableItems.length,
    cart_campaign_id: resolveBuyerCartCampaignId(campaignId, items),
    line_items: items.map((item) => ({
      tenant_product_id: item.tenant_product_id,
      internal_sku: item.internal_sku ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      campaign_id: item.campaign_id ?? null,
      has_campaign_price: item.has_campaign_price === true,
      stock_status: item.stock_status ?? null,
    })),
  };
}

export interface CartContextValue {
  items: BuyerCartItem[];
  campaignId: string | null;
  resolvedCampaignId: string | null;
  itemCount: number;
  subtotal: number;
  setCampaignId: (campaignId: string | null) => void;
  addItem: (item: BuyerCartItem, campaignId?: string | null, analytics?: CartAnalyticsContext) => void;
  removeItem: (tenant_product_id: string) => void;
  removeItems: (tenant_product_ids: string[]) => void;
  updateQty: (tenant_product_id: string, quantity: number) => void;
  clearCart: () => void;
  replaceItems: (items: BuyerCartItem[]) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function BuyerCartProvider({ children }: { children: ReactNode }) {
  const posthog = usePostHog();
  const { tenant_id: currentTenantId } = useBuyerAnalyticsIds();
  const hasClientMutationRef = useRef(false);

  // Always start from an empty, server-matching state — reading localStorage in the
  // reducer's lazy initializer ran during the client's first render and could disagree
  // with the server-rendered (always-empty) HTML, causing a hydration mismatch. Hydrating
  // in an effect instead guarantees the first client render matches the server render.
  const [state, dispatch] = useReducer(cartReducer, { items: [], campaignId: null });
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (hasClientMutationRef.current) return;
    dispatch({ type: 'HYDRATE', state: readInitialCartState() });
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
        localStorage.setItem(BUYER_CART_CAMPAIGN_STORAGE_KEY, state.campaignId);
      } else {
        localStorage.removeItem(BUYER_CART_CAMPAIGN_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [state.campaignId]);

  const setCampaignId = useCallback((campaignId: string | null) => {
    hasClientMutationRef.current = true;
    dispatch({ type: 'SET_CAMPAIGN_ID', campaignId });
  }, []);

  const addItem = useCallback((item: BuyerCartItem, campaignId?: string | null, analytics?: CartAnalyticsContext) => {
    hasClientMutationRef.current = true;
    const currentState = stateRef.current;
    const effectiveCampaignId = campaignId ?? item.campaign_id ?? currentState.campaignId ?? null;
    const stampedItem = effectiveCampaignId
      ? { ...item, campaign_id: effectiveCampaignId }
      : item;

    if (effectiveCampaignId) {
      dispatch({ type: 'SET_CAMPAIGN_ID', campaignId: effectiveCampaignId });
    }
    const nextItems = getItemsAfterAdd(currentState.items, stampedItem, effectiveCampaignId);
    dispatch({ type: 'ADD_ITEM', item: stampedItem });
    posthog?.capture('catalog_item_added_to_cart', {
      tenant_id: currentTenantId,
      tenant_product_id: item.tenant_product_id,
      product_name: item.name,
      brand: item.brand,
      internal_sku: item.internal_sku,
      tenant_category_id: item.tenant_category_id,
      unit_price: item.unit_price,
      resolved_price: item.resolved_price ?? null,
      has_campaign_price: item.has_campaign_price === true,
      gst_rate: item.gst_rate ?? null,
      quantity: item.quantity,
      campaign_id: effectiveCampaignId,
      stock_status: item.stock_status ?? null,
      source_surface: analytics?.source_surface ?? 'unknown',
      source_widget: analytics?.source_widget ?? null,
      source_product_id: analytics?.source_product_id ?? null,
      source_document_type: analytics?.source_document_type ?? null,
      ...getCartAnalyticsSnapshot(nextItems, effectiveCampaignId),
    });
  }, [posthog]);

  const removeItem = useCallback((tenant_product_id: string) => {
    hasClientMutationRef.current = true;
    const currentState = stateRef.current;
    const removedItem = currentState.items.find((item) => item.tenant_product_id === tenant_product_id);
    const nextItems = currentState.items.filter((i) => i.tenant_product_id !== tenant_product_id);
    dispatch({ type: 'REMOVE_ITEM', tenant_product_id });
    if (removedItem) {
      posthog?.capture('buyer_cart_item_removed', {
        tenant_product_id,
        internal_sku: removedItem.internal_sku ?? null,
        quantity: removedItem.quantity,
        unit_price: removedItem.unit_price,
        line_total: removedItem.line_total,
        campaign_id: removedItem.campaign_id ?? currentState.campaignId,
        source_surface: 'buyer_cart',
        ...getCartAnalyticsSnapshot(nextItems, currentState.campaignId),
      });
    }
  }, [posthog]);

  const removeItems = useCallback((tenant_product_ids: string[]) => {
    hasClientMutationRef.current = true;
    if (tenant_product_ids.length === 0) return;
    const currentState = stateRef.current;
    const removedItems = currentState.items.filter((item) => tenant_product_ids.includes(item.tenant_product_id));
    const nextItems = currentState.items.filter((i) => !tenant_product_ids.includes(i.tenant_product_id));
    dispatch({ type: 'REMOVE_ITEMS', tenant_product_ids });
    if (removedItems.length > 0) {
      posthog?.capture('buyer_cart_items_removed', {
        tenant_product_ids,
        removed_count: removedItems.length,
        source_surface: 'buyer_cart',
        ...getCartAnalyticsSnapshot(nextItems, currentState.campaignId),
      });
    }
  }, [posthog]);

  const updateQty = useCallback((tenant_product_id: string, quantity: number) => {
    hasClientMutationRef.current = true;
    const currentState = stateRef.current;
    const previousItem = currentState.items.find((item) => item.tenant_product_id === tenant_product_id);
    const nextItems = getItemsAfterQtyUpdate(currentState.items, tenant_product_id, quantity);
    dispatch({ type: 'UPDATE_QTY', tenant_product_id, quantity });
    if (previousItem) {
      posthog?.capture('buyer_cart_item_quantity_changed', {
        tenant_product_id,
        internal_sku: previousItem.internal_sku ?? null,
        previous_quantity: previousItem.quantity,
        next_quantity: Math.max(0, quantity),
        removed_by_zero_quantity: quantity <= 0,
        unit_price: previousItem.unit_price,
        campaign_id: previousItem.campaign_id ?? currentState.campaignId,
        source_surface: 'buyer_cart',
        ...getCartAnalyticsSnapshot(nextItems, currentState.campaignId),
      });
    }
  }, [posthog]);

  const clearCart = useCallback(() => {
    hasClientMutationRef.current = true;
    const currentState = stateRef.current;
    if (currentState.items.length > 0) {
      posthog?.capture('buyer_cart_cleared', {
        source_surface: 'buyer_cart',
        ...getCartAnalyticsSnapshot(currentState.items, currentState.campaignId),
      });
    }
    dispatch({ type: 'CLEAR_CART' });
  }, [posthog]);

  const replaceItems = useCallback((items: BuyerCartItem[]) => {
    hasClientMutationRef.current = true;
    dispatch({ type: 'REPLACE_ITEMS', items });
  }, []);

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = state.items.reduce((sum, i) => sum + i.line_total, 0);
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
    removeItems,
    updateQty,
    clearCart,
    replaceItems,
  }), [
    addItem,
    clearCart,
    itemCount,
    removeItem,
    removeItems,
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
