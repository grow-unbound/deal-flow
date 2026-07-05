import { describe, expect, it } from 'vitest';

import { getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import {
  matchesEstimateStatusChip,
  matchesInvoiceStatusChip,
  matchesOrderStatusChip,
} from '@/lib/buyer-transaction-filters';

describe('getSentinelInsertIndex', () => {
  it('returns -1 for empty lists', () => {
    expect(getSentinelInsertIndex(0)).toBe(-1);
  });

  it('places sentinel on last item for short lists', () => {
    expect(getSentinelInsertIndex(1)).toBe(0);
    expect(getSentinelInsertIndex(3)).toBe(2);
  });

  it('places sentinel near 75% for longer lists', () => {
    expect(getSentinelInsertIndex(8)).toBe(5);
    expect(getSentinelInsertIndex(20)).toBe(14);
  });
});

describe('buyer transaction status chips', () => {
  it('maps order statuses to chips', () => {
    expect(matchesOrderStatusChip('received', 'Received')).toBe(true);
    expect(matchesOrderStatusChip('dispatched', 'In Transit')).toBe(true);
    expect(matchesOrderStatusChip('received', 'Delivered')).toBe(false);
    expect(matchesOrderStatusChip('cancelled', 'All')).toBe(true);
  });

  it('maps estimate statuses to chips', () => {
    expect(matchesEstimateStatusChip('sent', 'Sent')).toBe(true);
    expect(matchesEstimateStatusChip('invoiced', 'Converted')).toBe(true);
    expect(matchesEstimateStatusChip('draft', 'Sent')).toBe(false);
  });

  it('maps invoice effective statuses to chips', () => {
    expect(matchesInvoiceStatusChip(
      { status: 'sent', due_date: '2026-12-01', outstanding_balance: 100 },
      'Due',
    )).toBe(true);
    expect(matchesInvoiceStatusChip(
      { status: 'sent', due_date: '2020-01-01', outstanding_balance: 100 },
      'Overdue',
    )).toBe(true);
    expect(matchesInvoiceStatusChip(
      { status: 'paid', due_date: null, outstanding_balance: 0 },
      'Paid',
    )).toBe(true);
    expect(matchesInvoiceStatusChip(
      { status: 'void', due_date: null, outstanding_balance: null },
      'Void',
    )).toBe(true);
  });
});
