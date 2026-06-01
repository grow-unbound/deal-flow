'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface BuyerCartItem {
  tenant_product_id: string;
  name: string;
  unit_price: number;
  qty: number;
}

interface BuyerCartContextValue {
  items: BuyerCartItem[];
  addItem: (item: BuyerCartItem) => void;
  removeItem: (tenant_product_id: string) => void;
  updateQty: (tenant_product_id: string, qty: number) => void;
  clearCart: () => void;
  subtotal: number;
  totalQty: number;
}

const BuyerCartContext = createContext<BuyerCartContextValue | null>(null);

export function BuyerCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BuyerCartItem[]>([]);

  const addItem = useCallback((item: BuyerCartItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.tenant_product_id === item.tenant_product_id);
      if (existing) {
        return prev.map(i =>
          i.tenant_product_id === item.tenant_product_id
            ? { ...i, qty: i.qty + item.qty }
            : i
        );
      }
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((tenant_product_id: string) => {
    setItems(prev => prev.filter(i => i.tenant_product_id !== tenant_product_id));
  }, []);

  const updateQty = useCallback((tenant_product_id: string, qty: number) => {
    if (qty <= 0) {
      setItems(prev => prev.filter(i => i.tenant_product_id !== tenant_product_id));
    } else {
      setItems(prev =>
        prev.map(i =>
          i.tenant_product_id === tenant_product_id ? { ...i, qty } : i
        )
      );
    }
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.qty, 0);
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <BuyerCartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, subtotal, totalQty }}>
      {children}
    </BuyerCartContext.Provider>
  );
}

export function useCart(): BuyerCartContextValue {
  const ctx = useContext(BuyerCartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a BuyerCartProvider');
  }
  return ctx;
}
