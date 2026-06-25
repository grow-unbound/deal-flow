import * as React from 'react';
import { StatusPill } from '@/components/ui/status-pill';

type OrderStatus =
  | 'draft'
  | 'received'
  | 'confirmed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

type ProductStatus = 'active' | 'inactive' | 'out_of_stock';

const ORDER_STATUS_MAP: Record<OrderStatus, { label: string; tone: React.ComponentProps<typeof StatusPill>['tone'] }> = {
  draft:      { label: 'Draft',      tone: 'neutral' },
  received:   { label: 'Received',   tone: 'info' },
  confirmed:  { label: 'Confirmed',  tone: 'accent' },
  dispatched: { label: 'Dispatched', tone: 'warning' },
  delivered:  { label: 'Delivered',  tone: 'success' },
  cancelled:  { label: 'Cancelled',  tone: 'danger' },
};

const PRODUCT_STATUS_MAP: Record<ProductStatus, { label: string; tone: React.ComponentProps<typeof StatusPill>['tone'] }> = {
  active:       { label: 'Active',       tone: 'success' },
  inactive:     { label: 'Inactive',     tone: 'neutral' },
  out_of_stock: { label: 'Out of stock', tone: 'warning' },
};

interface OrderStatusPillProps {
  status: OrderStatus;
}

interface ProductStatusPillProps {
  status: ProductStatus;
}

function OrderStatusPill({ status }: OrderStatusPillProps) {
  const { label, tone } = ORDER_STATUS_MAP[status] ?? { label: status, tone: 'neutral' as const };
  return <StatusPill label={label} tone={tone} />;
}

function ProductStatusPill({ status }: ProductStatusPillProps) {
  const { label, tone } = PRODUCT_STATUS_MAP[status] ?? { label: status, tone: 'neutral' as const };
  return <StatusPill label={label} tone={tone} />;
}

export { OrderStatusPill, ProductStatusPill };
export type { OrderStatus, ProductStatus };
