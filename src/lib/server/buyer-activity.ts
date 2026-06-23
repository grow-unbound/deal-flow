import type { BuyerActivityFeedResponse, BuyerActivityItem } from '@/lib/buyer-home-types';

type BuyerActivityDbClient = {
  schema: (schema: 'app') => {
    from: (table: 'orders' | 'invoices' | 'estimates' | 'payments') => {
      select: (columns: string) => any;
    };
  };
};

interface LoadBuyerActivityFeedArgs {
  tenantId: string;
  buyerId: string;
  limit?: number;
  cursor?: string | null;
}

interface CursorPayload {
  timestamp: string;
  id: string;
}

function encodeCursor(value: CursorPayload): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value: string | null | undefined): CursorPayload | null {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as CursorPayload;
  } catch {
    return null;
  }
}

function compareActivityDesc(a: BuyerActivityItem, b: BuyerActivityItem): number {
  const timeDelta = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  if (timeDelta !== 0) return timeDelta;
  return b.id.localeCompare(a.id);
}

function rowAfterCursor(row: BuyerActivityItem, cursor: CursorPayload | null): boolean {
  if (!cursor) return true;
  const rowTime = new Date(row.timestamp).getTime();
  const cursorTime = new Date(cursor.timestamp).getTime();
  if (rowTime !== cursorTime) return rowTime < cursorTime;
  return row.id < cursor.id;
}

export async function loadBuyerActivityFeed(
  db: BuyerActivityDbClient,
  { tenantId, buyerId, limit = 10, cursor }: LoadBuyerActivityFeedArgs,
): Promise<BuyerActivityFeedResponse> {
  const cappedLimit = Math.min(Math.max(limit, 1), 50);
  const decodedCursor = decodeCursor(cursor);

  const [ordersRes, invoicesRes, estimatesRes, paymentsRes] = await Promise.all([
    db
      .schema('app')
      .from('orders')
      .select('id, order_number, status, total_amount, placed_at')
      .eq('tenant_id', tenantId)
      .eq('buyer_id', buyerId)
      .is('deleted_at', null)
      .order('placed_at', { ascending: false })
      .limit(60),
    db
      .schema('app')
      .from('invoices')
      .select('id, invoice_number, status, total_amount, invoice_date, due_date')
      .eq('tenant_id', tenantId)
      .eq('buyer_id', buyerId)
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false })
      .limit(60),
    db
      .schema('app')
      .from('estimates')
      .select('id, estimate_number, status, total_amount, created_at')
      .eq('tenant_id', tenantId)
      .eq('buyer_id', buyerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(60),
    db
      .schema('app')
      .from('payments')
      .select('id, invoice_id, amount, status, paid_at')
      .eq('tenant_id', tenantId)
      .eq('buyer_id', buyerId)
      .is('deleted_at', null)
      .order('paid_at', { ascending: false })
      .limit(60),
  ]);

  const firstError = ordersRes.error ?? invoicesRes.error ?? estimatesRes.error ?? paymentsRes.error;
  if (firstError) {
    throw new Error(firstError.message ?? 'Failed to load buyer activity');
  }

  const rows: BuyerActivityItem[] = [
    ...((ordersRes.data ?? []) as Array<{
      id: string;
      order_number: string;
      status: string;
      total_amount: number | null;
      placed_at: string | null;
    }>).map((row) => ({
      id: `order:${row.id}`,
      type: 'order' as const,
      entity_id: row.id,
      title: row.order_number,
      status: row.status,
      amount: Number(row.total_amount ?? 0),
      timestamp: row.placed_at ?? new Date(0).toISOString(),
      href: `/buy/orders/${row.id}`,
      meta: 'Sales order',
    })),
    ...((invoicesRes.data ?? []) as Array<{
      id: string;
      invoice_number: string;
      status: string;
      total_amount: number | null;
      invoice_date: string | null;
      due_date: string | null;
    }>).map((row) => ({
      id: `invoice:${row.id}`,
      type: 'invoice' as const,
      entity_id: row.id,
      title: row.invoice_number,
      status: row.status,
      amount: Number(row.total_amount ?? 0),
      timestamp: row.invoice_date ?? new Date(0).toISOString(),
      href: `/buy/invoices/${row.id}`,
      meta: row.due_date ? `Due ${new Date(row.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : 'Invoice',
    })),
    ...((estimatesRes.data ?? []) as Array<{
      id: string;
      estimate_number: string | null;
      status: string;
      total_amount: number | null;
      created_at: string | null;
    }>).map((row) => ({
      id: `estimate:${row.id}`,
      type: 'estimate' as const,
      entity_id: row.id,
      title: row.estimate_number ?? `Estimate ${row.id.slice(0, 8).toUpperCase()}`,
      status: row.status,
      amount: Number(row.total_amount ?? 0),
      timestamp: row.created_at ?? new Date(0).toISOString(),
      href: `/buy/estimates/${row.id}`,
      meta: 'Estimate',
    })),
    ...((paymentsRes.data ?? []) as Array<{
      id: string;
      invoice_id: string | null;
      amount: number | null;
      status: string;
      paid_at: string | null;
    }>).map((row) => ({
      id: `payment:${row.id}`,
      type: 'payment' as const,
      entity_id: row.id,
      title: row.invoice_id ? 'Invoice payment' : 'Payment received',
      status: row.status,
      amount: Number(row.amount ?? 0),
      timestamp: row.paid_at ?? new Date(0).toISOString(),
      href: row.invoice_id ? `/buy/invoices/${row.invoice_id}` : '/buy/orders?tab=invoices',
      secondary_label: `Paid ₹${Math.round(Number(row.amount ?? 0)).toLocaleString('en-IN')}`,
      meta: 'Payment',
    })),
  ];

  const sorted = rows.sort(compareActivityDesc).filter((row) => rowAfterCursor(row, decodedCursor));
  const items = sorted.slice(0, cappedLimit);
  const next = sorted[cappedLimit] ?? null;

  return {
    items,
    next_cursor: next ? encodeCursor({ timestamp: next.timestamp, id: next.id }) : null,
  };
}
