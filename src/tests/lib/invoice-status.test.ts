import { describe, expect, it, vi } from 'vitest';

import { effectiveInvoiceStatus, hasInvoiceReceivableExposure, isInvoiceOverdue } from '@/lib/invoice-status';

describe('invoice status helpers', () => {
  it('treats past-due partially paid invoices as overdue', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T06:00:00.000Z'));

    const row = {
      status: 'partially_paid',
      due_date: '2026-07-19T00:00:00.000Z',
      outstanding_balance: 1200,
    };

    expect(hasInvoiceReceivableExposure(row)).toBe(true);
    expect(isInvoiceOverdue(row)).toBe(true);
    expect(effectiveInvoiceStatus(row)).toBe('overdue');

    vi.useRealTimers();
  });

  it('does not mark null-balance invoices as overdue', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T06:00:00.000Z'));

    const row = {
      status: 'sent',
      due_date: '2026-07-19T00:00:00.000Z',
      outstanding_balance: null,
    };

    expect(hasInvoiceReceivableExposure(row)).toBe(false);
    expect(isInvoiceOverdue(row)).toBe(false);

    vi.useRealTimers();
  });

  it('does not mark zero-balance invoices as overdue just because the due date passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T06:00:00.000Z'));

    const row = {
      status: 'partially_paid',
      due_date: '2026-07-19T00:00:00.000Z',
      outstanding_balance: 0,
    };

    expect(hasInvoiceReceivableExposure(row)).toBe(false);
    expect(isInvoiceOverdue(row)).toBe(false);
    expect(effectiveInvoiceStatus(row)).toBe('sent');

    vi.useRealTimers();
  });
});
