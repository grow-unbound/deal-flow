import { describe, expect, it } from 'vitest';
import { buildCreditLimitSupportingLine, buildEntryAmountLabel, buildListSupportingLine, buildTargetRangeLabel } from '@/lib/inbox/inbox-entry-copy';
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
    expect(buildListSupportingLine([due('a', 'invoice_overdue', 22000)])).toBe('1 invoice · ₹22,000 overdue');
  });

  it('splits due vs overdue counts when mixed', () => {
    const line = buildListSupportingLine([
      due('a', 'invoice_due', 90690), due('b', 'invoice_due', 4440),
      due('c', 'invoice_overdue', 6500), due('d', 'invoice_overdue', 14550),
    ]);
    expect(line).toBe('4 invoices · ₹1,16,180 due · 2 overdue');
  });
});
