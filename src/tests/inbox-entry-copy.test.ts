import { describe, expect, it } from 'vitest';
import { buildCreditLimitSupportingLine, buildLiveCreditLimitLine, buildEntryAmountLabel, buildListSupportingLine, buildTargetRangeLabel } from '@/lib/inbox/inbox-entry-copy';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

describe('buildTargetRangeLabel', () => {
  it('renders a full range when both bounds are given', () => {
    expect(buildTargetRangeLabel(1800, 2000)).toBe('₹1,800 – ₹2,000');
  });

  it('renders a single value when both bounds are equal', () => {
    expect(buildTargetRangeLabel(1500, 1500)).toBe('₹1,500');
  });

  it('renders "Max X" when only the max is given -- not "– – X"', () => {
    expect(buildTargetRangeLabel(null, 1500)).toBe('Max ₹1,500');
  });

  it('renders "Min X" when only the min is given -- not "X – –"', () => {
    expect(buildTargetRangeLabel(5000, null)).toBe('Min ₹5,000');
  });

  it('renders null when neither bound is given', () => {
    expect(buildTargetRangeLabel(null, null)).toBeNull();
  });
});

function entry(overrides: Partial<InboxEntry>): InboxEntry {
  return {
    id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Buyer',
    buyer_phone: null, location_id: null, entry_type: 'credit_limit_breach', status: 'new',
    source_channel: 'backend', source_entity_type: 'buyer', source_entity_id: 'b1',
    title: 'Buyer', summary: '', amount: null, currency: null,
    priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: [], time_bucket: 'today', customer_entry_count: 1,
    ...overrides,
  };
}

describe('buildEntryAmountLabel', () => {
  it('formats as currency when currency is missing (credit_limit_breach carries none)', () => {
    expect(buildEntryAmountLabel(entry({ amount: 454980, currency: null }))).toBe('₹4,54,980');
  });
});

describe('buildCreditLimitSupportingLine', () => {
  it('names both the over-limit amount and the credit limit', () => {
    const e = entry({ metadata: { over_limit_amount: 454980, credit_limit: 250000 } });
    expect(buildCreditLimitSupportingLine(e)).toBe('₹4,54,980 over your ₹2,50,000 limit');
  });

  it('falls back when the credit limit is unknown', () => {
    const e = entry({ metadata: { over_limit_amount: 454980 } });
    expect(buildCreditLimitSupportingLine(e)).toBe('₹4,54,980 over limit');
  });
});

describe('buildListSupportingLine — dues', () => {
  const due = (id: string, type: 'invoice_due' | 'invoice_overdue', amount: number) =>
    entry({ id, entry_type: type, amount, currency: 'INR' });

  it('says "overdue" (not "due") when every invoice in the group is overdue', () => {
    expect(buildListSupportingLine([due('a', 'invoice_overdue', 22000)])).toBe('₹22,000 overdue · 1 invoice');
  });

  it('splits due vs overdue counts when mixed', () => {
    const line = buildListSupportingLine([
      due('a', 'invoice_due', 90690), due('b', 'invoice_due', 4440),
      due('c', 'invoice_overdue', 6500), due('d', 'invoice_overdue', 14550),
    ]);
    expect(line).toBe('₹1,16,180 due · 4 invoices · 2 overdue');
  });
});

describe('buildLiveCreditLimitLine', () => {
  const breach = entry({
    id: 'c', entry_type: 'credit_limit_breach', amount: 502480,
    metadata: { credit_limit: 200000, outstanding_balance: 702480, over_limit_amount: 502480 },
  });

  it('recomputes the over-limit amount from live outstanding and notes the change', () => {
    expect(buildLiveCreditLimitLine(breach, 712819)).toEqual({
      line: '₹5,12,819 over your ₹2,00,000 limit',
      changeNote: 'Was ₹5,02,480 over when flagged',
    });
  });

  it('shows no change note when live matches the snapshot', () => {
    expect(buildLiveCreditLimitLine(breach, 702480)?.changeNote).toBeNull();
  });

  it('says the buyer is within the limit once outstanding drops below it', () => {
    expect(buildLiveCreditLimitLine(breach, 150000)?.line).toBe('Now within your ₹2,00,000 limit');
  });

  it('returns null without a saved limit', () => {
    expect(buildLiveCreditLimitLine(entry({ id: 'x', entry_type: 'credit_limit_breach', metadata: {} }), 1)).toBeNull();
  });
});

describe('buildListSupportingLine — WhatsApp', () => {
  it('uses the last inbound message preview for WhatsApp buyer messages', () => {
    expect(buildListSupportingLine([
      entry({
        entry_type: 'whatsapp_buyer_message',
        source_channel: 'whatsapp',
        source_entity_type: 'whatsapp_thread',
        metadata: { last_inbound_text: 'Do you have stock for SKU 123?' },
      }),
    ])).toBe('Do you have stock for SKU 123?');
  });
});
