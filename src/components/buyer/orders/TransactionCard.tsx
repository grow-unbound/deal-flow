'use client';

import { ActivityCardShell } from './ActivityCardShell';
import type { StatusTone } from '@/components/ui/status-pill';

export interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  placed_at: string;
  item_count?: number;
  description?: string;
}

interface TransactionCardProps {
  order: OrderSummary;
  href?: string;
}

function inr(n: number): string {
  const s = Math.round(n).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type StatusKey = 'received' | 'pending' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled';

const statusBadge: Record<StatusKey, { tone: StatusTone; label: string }> = {
  received:  { tone: 'info', label: 'Received' },
  pending:   { tone: 'info', label: 'Pending' },
  confirmed: { tone: 'accent', label: 'Confirmed' },
  dispatched:{ tone: 'warning', label: 'Dispatched' },
  delivered: { tone: 'success', label: 'Delivered' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
};

function getBadge(status: string): { tone: StatusTone; label: string } {
  return statusBadge[status as StatusKey] ?? statusBadge.received;
}

export function TransactionCard({ order, href }: TransactionCardProps) {
  const badge = getBadge(order.status);

  const itemsAndDate = order.item_count != null && order.item_count > 0
    ? `${order.item_count} item${order.item_count !== 1 ? 's' : ''} · ${formatDate(order.placed_at)}`
    : formatDate(order.placed_at);

  return (
    <ActivityCardShell
      href={href}
      documentNumber={order.order_number}
      statusLabel={badge.label}
      statusTone={badge.tone}
      middleLeft={order.description || '—'}
      middleRight={<span className="tabular-inline">{itemsAndDate}</span>}
      amount={<span className="tabular-inline">{inr(order.total_amount)}</span>}
    />
  );
}
