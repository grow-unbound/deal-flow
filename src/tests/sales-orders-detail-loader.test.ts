import { describe, expect, it } from 'vitest';

import { loadTenantSalesOrderDetail } from '@/lib/sales-orders/load-tenant-sales-order-detail';

function makeRowResponse(data: unknown) {
  return { data, error: null };
}

class QueryMock {
  constructor(
    private readonly table: string,
    private readonly rows: Record<string, unknown[]>,
  ) {}

  select() { return this; }
  eq() { return this; }
  is() { return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return this; }

  then(resolve: (value: { data: unknown; error: null }) => void) {
    if (this.table === 'orders') {
      return resolve(makeRowResponse(this.rows.orders?.[0] ?? null));
    }
    if (this.table === 'order_items') {
      return resolve(makeRowResponse(this.rows.order_items ?? []));
    }
    if (this.table === 'audit_log') {
      return resolve(makeRowResponse(this.rows.audit_log ?? []));
    }
    if (this.table === 'tenants') {
      return resolve(makeRowResponse(this.rows.tenants?.[0] ?? null));
    }
    if (this.table === 'locations') {
      return resolve(makeRowResponse(this.rows.locations?.[0] ?? null));
    }
    return resolve(makeRowResponse([]));
  }
}

function makeDb(rows: Record<string, unknown[]>) {
  return {
    schema: () => ({
      from: (table: string) => new QueryMock(table, rows),
    }),
  };
}

describe('loadTenantSalesOrderDetail', () => {
  it('returns draft sales orders instead of treating them as missing', async () => {
    const result = await loadTenantSalesOrderDetail(
      makeDb({
        orders: [
          {
            id: 'ord-1',
            tenant_id: 'tenant-1',
            location_id: null,
            buyer_id: null,
            order_number: 'SO-2026-00001',
            status: 'draft',
            source: 'cockpit_manual',
            campaign_id: null,
            placed_at: '2026-07-01T00:00:00.000Z',
            subtotal: 0,
            tax_amount: 0,
            total_amount: 0,
            currency: 'INR',
            notes: null,
            estimate_id: null,
            buyer_po_ref: null,
            discount_flat: 0,
            freight: 0,
            round_off: 0,
            has_backorder: false,
            expected_delivery: null,
            received_at: null,
            confirmed_at: null,
            dispatched_at: null,
            delivered_at: null,
            cancelled_at: null,
            carrier: null,
            dispatch_notes: null,
            cancel_reason: null,
          },
        ],
        order_items: [],
        audit_log: [],
        tenants: [{ id: 'tenant-1', primary_state: 'Maharashtra' }],
      }),
      'tenant-1',
      'ord-1',
      'seller_admin',
      null,
    );

    expect(result).not.toBe('notfound');
    expect(result).not.toBe('forbidden');
    if (result === 'notfound' || result === 'forbidden') {
      throw new Error('Expected a draft order detail payload');
    }
    expect(result.id).toBe('ord-1');
    expect(result.db_status).toBe('draft');
    expect(result.buyer.name).toBe('Unassigned buyer');
  });
});
