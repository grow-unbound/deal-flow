import { describe, expect, it } from 'vitest';
import { buildCreditLimitSupportingLine, buildEntryAmountLabel, buildListSupportingLine } from '@/lib/inbox/inbox-entry-copy';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

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
