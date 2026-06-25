import { describe, expect, it, vi } from 'vitest';

import { loadBuyerCreditSnapshot } from '@/lib/server/buyer-credit';

function makeDb(rows: Array<{ buyer_id: string; outstanding_balance: number | null; due_date: string | null; status: string }>) {
  const chain = {
    eq() { return chain; },
    in() { return chain; },
    neq() { return chain; },
    is: vi.fn(async () => ({ data: rows, error: null })),
  };
  return {
    schema() {
      return {
        from(table: 'buyers' | 'invoices') {
          return {
            select() {
              return chain;
            },
          };
        },
      };
    },
  } as any;
}

function makeErrorDb(message = 'Bad Request') {
  const chain = {
    eq() { return chain; },
    in() { return chain; },
    neq() { return chain; },
    is: vi.fn(async () => ({ data: null, error: { message } })),
  };
  return {
    schema() {
      return {
        from(table: 'buyers' | 'invoices') {
          return {
            select() {
              return chain;
            },
          };
        },
      };
    },
  } as any;
}

describe('loadBuyerCreditSnapshot', () => {
  it('sums unpaid non-draft invoices and returns the earliest due date', async () => {
    const snapshot = await loadBuyerCreditSnapshot(
      makeDb([
        { buyer_id: 'buyer-1', outstanding_balance: 5000, due_date: '2026-06-25', status: 'sent' },
        { buyer_id: 'buyer-1', outstanding_balance: 2500, due_date: '2026-06-22', status: 'overdue' },
        { buyer_id: 'buyer-1', outstanding_balance: 0, due_date: '2026-06-30', status: 'paid' },
      ]),
      { tenantId: 'tenant-1', buyerId: 'buyer-1', creditLimit: 20000 },
    );

    expect(snapshot.credit_limit).toBe(20000);
    expect(snapshot.credit_used).toBe(7500);
    expect(snapshot.outstanding_dues).toBe(7500);
    expect(snapshot.available_credit).toBe(12500);
    expect(snapshot.open_invoice_count).toBe(2);
    expect(snapshot.earliest_due_date).toBe('2026-06-22');
  });

  it('clamps available credit at zero', async () => {
    const snapshot = await loadBuyerCreditSnapshot(
      makeDb([
        { buyer_id: 'buyer-1', outstanding_balance: 12000, due_date: '2026-06-25', status: 'sent' },
      ]),
      { tenantId: 'tenant-1', buyerId: 'buyer-1', creditLimit: 10000 },
    );

    expect(snapshot.available_credit).toBe(0);
  });

  it('falls back to zero dues when invoice enrichment fails', async () => {
    const snapshot = await loadBuyerCreditSnapshot(
      makeErrorDb(),
      { tenantId: 'tenant-1', buyerId: 'buyer-1', creditLimit: 20000 },
    );

    expect(snapshot.credit_limit).toBe(20000);
    expect(snapshot.outstanding_dues).toBe(0);
    expect(snapshot.available_credit).toBe(20000);
    expect(snapshot.open_invoice_count).toBe(0);
    expect(snapshot.earliest_due_date).toBeNull();
  });
});
