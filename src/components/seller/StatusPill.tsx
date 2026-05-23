import * as React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';

type OrderStatus =
  | 'draft'
  | 'received'
  | 'confirmed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

type ProductStatus = 'active' | 'inactive' | 'out_of_stock';

const ORDER_STATUS_MAP: Record<OrderStatus, { label: string; variant: BadgeProps['variant'] }> = {
  draft:      { label: 'Draft',      variant: 'default' },
  received:   { label: 'Received',   variant: 'info' },
  confirmed:  { label: 'Confirmed',  variant: 'teal' },
  dispatched: { label: 'Dispatched', variant: 'warning' },
  delivered:  { label: 'Delivered',  variant: 'success' },
  cancelled:  { label: 'Cancelled',  variant: 'danger' },
};

const PRODUCT_STATUS_MAP: Record<ProductStatus, { label: string; variant: BadgeProps['variant'] }> = {
  active:       { label: 'Active',        variant: 'success' },
  inactive:     { label: 'Inactive',      variant: 'default' },
  out_of_stock: { label: 'Out of stock',  variant: 'warning' },
};

interface OrderStatusPillProps {
  status: OrderStatus;
}

interface ProductStatusPillProps {
  status: ProductStatus;
}

function OrderStatusPill({ status }: OrderStatusPillProps) {
  const { label, variant } = ORDER_STATUS_MAP[status] ?? { label: status, variant: 'default' as const };
  return <Badge variant={variant}>{label}</Badge>;
}

function ProductStatusPill({ status }: ProductStatusPillProps) {
  const { label, variant } = PRODUCT_STATUS_MAP[status] ?? { label: status, variant: 'default' as const };
  return <Badge variant={variant}>{label}</Badge>;
}

export { OrderStatusPill, ProductStatusPill };
export type { OrderStatus, ProductStatus };
