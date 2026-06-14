'use client';

import * as React from 'react';
import { ClipboardList } from 'lucide-react';
import { TransactionCard } from './TransactionCard';
import { OrderRowSkeleton } from './OrderRowSkeleton';
import type { OrderSummary } from './TransactionCard';

interface OrdersApiResponse {
  orders: OrderSummary[];
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        padding: '40px 16px',
        textAlign: 'center',
      }}
    >
      <ClipboardList size={48} strokeWidth={1.5} style={{ marginBottom: 16, color: 'var(--fg-3)' }} />
      <p style={{ fontSize: 'var(--yk-text-md)', fontWeight: 600, color: 'var(--fg-1)', margin: '0 0 6px' }}>No orders yet</p>
      <p style={{ fontSize: 'var(--yk-text-base)', color: 'var(--fg-3)', margin: 0 }}>Your orders will appear here once placed.</p>
    </div>
  );
}

export function OrdersTab() {
  const [orders, setOrders] = React.useState<OrderSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchOrders() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/buyer/orders');
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json() as OrdersApiResponse;
        if (!cancelled) {
          setOrders(data.orders ?? []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load orders');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchOrders();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <OrderRowSkeleton count={3} />;
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '40vh',
          padding: '40px 16px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 'var(--yk-text-base)', color: 'var(--danger-500)', margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return <EmptyState />;
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {orders.map((order) => (
        <TransactionCard key={order.id} order={order} />
      ))}
    </div>
  );
}
