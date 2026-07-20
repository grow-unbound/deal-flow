'use client';

import * as React from 'react';
import { ShoppingCart, Trash2, Minus, Plus, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBuyerCurrency, hasBuyerCampaignPrice } from '@/lib/buyer-ui';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter } from '@/components/ui/sheet';

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  price: number;
  resolvedPrice?: number | null;
  hasCampaignPrice?: boolean;
  unit?: string;
  quantity: number;
}

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  onQuantityChange: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
  checkingOut?: boolean;
}

function CartSheet({ open, onOpenChange, items, onQuantityChange, onRemove, onCheckout, checkingOut }: CartSheetProps) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-teal-500" />
            Cart
            {itemCount > 0 && (
              <span className="ml-1 bg-teal-500 text-cream-50 text-caption font-semibold rounded-pill px-2 py-0.5">
                {itemCount}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <SheetBody>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <ShoppingCart className="h-12 w-12 text-cream-300" />
              <p className="text-body-sm text-cream-500">Your cart is empty</p>
              <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                Browse catalog
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <CartItemRow
                  key={item.productId}
                  item={item}
                  onQuantityChange={onQuantityChange}
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}
        </SheetBody>

        {items.length > 0 && (
          <SheetFooter>
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-body-sm text-cream-700">Subtotal ({itemCount} items)</span>
                <span className="text-h4 font-mono font-semibold text-cream-900">{formatBuyerCurrency(subtotal)}</span>
              </div>
              <p className="text-caption text-cream-500">Taxes and shipping calculated at checkout</p>
              <Button
                variant="primary"
                className="w-full h-12"
                onClick={onCheckout}
                disabled={checkingOut}
              >
                {checkingOut ? 'Placing order…' : `Place order · ${formatBuyerCurrency(subtotal)}`}
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CartItemRow({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: CartItem;
  onQuantityChange: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  const showCampaignPrice = hasBuyerCampaignPrice({
    has_campaign_price: item.hasCampaignPrice,
    price: item.price,
    resolved_price: item.resolvedPrice,
  });

  return (
    <div className="flex gap-3 items-start">
      {/* Thumbnail */}
      <div className="h-14 w-14 rounded-md bg-cream-100 flex items-center justify-center overflow-hidden shrink-0">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <Package className="h-5 w-5 text-cream-400" />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        {item.brand && <p className="eyebrow text-cream-500">{item.brand}</p>}
        <p className="text-body-sm font-medium text-cream-900 truncate">{item.name}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-cream-700">
          <p className="text-body-sm font-mono">{formatBuyerCurrency(item.price)}{item.unit && ` / ${item.unit}`}</p>
          {showCampaignPrice ? (
            <span className="text-caption line-through">{formatBuyerCurrency(item.resolvedPrice)}</span>
          ) : null}
        </div>
      </div>

      {/* Qty + remove */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <button
          onClick={() => onRemove(item.productId)}
          className="text-cream-400 hover:text-danger-500 transition-colors"
          aria-label="Remove item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-center bg-cream-100 rounded-md overflow-hidden">
          <button
            onClick={() => onQuantityChange(item.productId, item.quantity - 1)}
            className="h-7 w-7 flex items-center justify-center text-teal-500 hover:bg-cream-200 transition-colors"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="text-body-sm font-semibold font-mono text-cream-900 min-w-[1.75rem] text-center">
            {item.quantity}
          </span>
          <button
            onClick={() => onQuantityChange(item.productId, item.quantity + 1)}
            className="h-7 w-7 flex items-center justify-center text-teal-500 hover:bg-cream-200 transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <p className="text-caption font-mono font-semibold text-cream-900">
          {formatBuyerCurrency(item.price * item.quantity)}
        </p>
      </div>
    </div>
  );
}

export { CartSheet };
