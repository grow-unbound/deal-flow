import { describe, expect, it } from 'vitest';
import { composeSellerDisplayName } from '@/lib/server/whatsapp-seller-context';
import { buildBuyerInvoiceSummaries } from '@/lib/server/whatsapp-invoice-summary';

describe('composeSellerDisplayName', () => {
  it('returns plain seller name for single-location tenants', () => {
    expect(composeSellerDisplayName('WineYard', 'Mumbai Warehouse', false)).toBe('WineYard');
  });

  it('appends location for multi-location tenants', () => {
    expect(composeSellerDisplayName('WineYard', 'Mumbai Warehouse', true)).toBe('WineYard (Mumbai Warehouse)');
  });
});

describe('buildBuyerInvoiceSummaries', () => {
  const now = new Date('2026-07-10T12:00:00Z');

  it('builds overdue status from due invoices', () => {
    const summaries = buildBuyerInvoiceSummaries([
      {
        buyer_id: 'buyer-1',
        due_date: '2026-07-01T12:00:00Z',
        outstanding_balance: 50000,
        status: 'overdue',
      },
      {
        buyer_id: 'buyer-1',
        due_date: '2026-07-05T12:00:00Z',
        outstanding_balance: 25000,
        status: 'unpaid',
      },
    ], now);

    expect(summaries.get('buyer-1')).toEqual({
      outstandingAmount: '75000',
      dueInvoiceCount: '2',
      dueStatus: 'overdue by 9 days',
    });
  });

  it('builds due-in status when no invoices are overdue', () => {
    const summaries = buildBuyerInvoiceSummaries([
      {
        buyer_id: 'buyer-2',
        due_date: '2026-07-15T12:00:00Z',
        outstanding_balance: 10000,
        status: 'sent',
      },
    ], now);

    expect(summaries.get('buyer-2')).toEqual({
      outstandingAmount: '10000',
      dueInvoiceCount: '1',
      dueStatus: 'due in 5 days',
    });
  });

  it('skips buyers with no receivable invoices', () => {
    const summaries = buildBuyerInvoiceSummaries([
      {
        buyer_id: 'buyer-3',
        due_date: '2026-07-15T12:00:00Z',
        outstanding_balance: 0,
        status: 'paid',
      },
    ], now);

    expect(summaries.has('buyer-3')).toBe(false);
  });
});
