import { describe, expect, it } from 'vitest';
import { groupEntriesByDateAndCustomer, isPinnedEntry, sortEntriesForStack } from '@/lib/inbox/inbox-grouping';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

function makeEntry(overrides: Partial<InboxEntry>): InboxEntry {
  return {
    id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Ramesh Traders',
    buyer_phone: null, location_id: null, entry_type: 'invoice_overdue', status: 'new',
    source_channel: 'backend', source_entity_type: 'invoice', source_entity_id: 'inv1',
    title: 'Ramesh Traders', summary: 'overdue', amount: 22000, currency: 'INR',
    priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-08-22T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: ['send_reminder'], time_bucket: 'today', customer_entry_count: 1,
    ...overrides,
  };
}

describe('isPinnedEntry', () => {
  it('pins credit_limit_breach', () => {
    expect(isPinnedEntry(makeEntry({ entry_type: 'credit_limit_breach' }))).toBe(true);
  });
  it('pins invoice_overdue at 16-30d and 30d+', () => {
    expect(isPinnedEntry(makeEntry({ entry_type: 'invoice_overdue', metadata: { aging_tier: '16-30d' } }))).toBe(true);
    expect(isPinnedEntry(makeEntry({ entry_type: 'invoice_overdue', metadata: { aging_tier: '30d+' } }))).toBe(true);
  });
  it('does not pin invoice_overdue under 16 days', () => {
    expect(isPinnedEntry(makeEntry({ entry_type: 'invoice_overdue', metadata: { aging_tier: '1-7d' } }))).toBe(false);
  });
  it('does not pin unrelated types', () => {
    expect(isPinnedEntry(makeEntry({ entry_type: 'new_enquiry' }))).toBe(false);
  });
});

describe('sortEntriesForStack', () => {
  it('puts pinned entries above newer, lower-stakes entries', () => {
    const newEnquiry = makeEntry({ id: 'a', entry_type: 'new_enquiry', priority_at: '2026-09-07T12:00:00Z' });
    const overdue30 = makeEntry({ id: 'b', entry_type: 'invoice_overdue', metadata: { aging_tier: '30d+' }, priority_at: '2026-09-01T00:00:00Z' });
    const sorted = sortEntriesForStack([newEnquiry, overdue30]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a']);
  });
  it('orders unpinned entries newest first', () => {
    const older = makeEntry({ id: 'a', priority_at: '2026-09-01T00:00:00Z', entry_type: 'new_enquiry' });
    const newer = makeEntry({ id: 'b', priority_at: '2026-09-07T00:00:00Z', entry_type: 'new_enquiry' });
    expect(sortEntriesForStack([older, newer]).map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('groupEntriesByDateAndCustomer', () => {
  it('places a customer under the bucket of their freshest entry, count is the true total', () => {
    const oldInvoice = makeEntry({ id: 'inv', time_bucket: 'yesterday', priority_at: '2026-09-06T09:00:00Z', customer_entry_count: 2 });
    const newEnquiry = makeEntry({ id: 'enq', entry_type: 'new_enquiry', time_bucket: 'today', priority_at: '2026-09-07T09:00:00Z', customer_entry_count: 2 });
    const grouped = groupEntriesByDateAndCustomer([oldInvoice, newEnquiry]);
    const todaySection = grouped.find((g) => g.bucket === 'today');
    expect(todaySection?.buyers).toHaveLength(1);
    expect(todaySection?.buyers[0].totalCount).toBe(2);
    expect(todaySection?.buyers[0].entries.map((e) => e.id).sort()).toEqual(['enq', 'inv']);
    expect(grouped.find((g) => g.bucket === 'yesterday')).toBeUndefined();
  });

  it('groups buyer-less entries by their own entry id', () => {
    const visitor = makeEntry({ id: 'v1', buyer_id: null, entry_type: 'new_user_login', buyer_name: 'Unknown visitor', customer_entry_count: 1 });
    const grouped = groupEntriesByDateAndCustomer([visitor]);
    expect(grouped[0].buyers[0].buyerKey).toBe('v1');
  });
});
