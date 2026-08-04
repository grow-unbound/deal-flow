import type { BuyerHomeDemandKind } from '@/lib/buyer-home-types';

export function buyerHomeDemandTitle(kind: string | undefined): string {
  if (kind === 'estimates') return 'Estimates this quarter';
  if (kind === 'orders') return 'Orders this quarter';
  return 'Demand this quarter';
}

export function buyerHomeDemandCountLabel(kind: string | undefined, count: number): string {
  if (kind === 'estimates') return `${count} estimate${count === 1 ? '' : 's'}`;
  if (kind === 'orders') return `${count} order${count === 1 ? '' : 's'}`;
  return `${count} document${count === 1 ? '' : 's'}`;
}

export function buyerHomeDemandHref(kind: string | undefined): string {
  if (kind === 'estimates') return '/buy/orders?tab=enquiries';
  if (kind === 'orders') return '/buy/orders?tab=orders';
  return '/buy/orders?tab=orders';
}

export function buyerHomeOverdueSummary(outstanding: number, overdue: number): string {
  if (outstanding <= 0) return 'No outstanding balance';
  if (overdue <= 0) return 'Nothing overdue';
  return 'Includes overdue amount';
}

export function formatBuyerHomeComputedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function isBuyerHomeDemandKind(value: string): value is BuyerHomeDemandKind {
  return value === 'orders' || value === 'estimates' || value === 'none';
}
