import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalEntryActions } from '@/lib/inbox/inbox-local-actions';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

const entry: InboxEntry = {
  id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Ramesh Traders',
  buyer_phone: null, location_id: null, entry_type: 'new_order_confirmation', status: 'new',
  source_channel: 'storefront', source_entity_type: 'order', source_entity_id: 'o1',
  title: 'Ramesh Traders', summary: 'New order', amount: 58000, currency: 'INR',
  priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
  last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
  metadata: {}, allowed_actions: ['accept_order', 'reject'], time_bucket: 'today', customer_entry_count: 1,
};

describe('useLocalEntryActions', () => {
  it('records an override and a local event for the entry', () => {
    const { result } = renderHook(() => useLocalEntryActions());
    act(() => {
      result.current.applyLocalAction(entry, 'accept_order', { nextStatus: 'resolved', nextSummary: 'Order accepted' });
    });
    expect(result.current.overrides['e1']).toEqual({ status: 'resolved', summary: 'Order accepted', allowed_actions: undefined });
    const events = result.current.getLocalEventsForEntry('e1');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entry_id: 'e1', action: 'accept_order', from_status: 'new', to_status: 'resolved', synced: false });
  });

  it('accumulates multiple local events across actions', () => {
    const { result } = renderHook(() => useLocalEntryActions());
    act(() => {
      result.current.applyLocalAction(entry, 'contact_buyer', { note: 'called, no answer' });
    });
    act(() => {
      result.current.applyLocalAction({ ...entry, status: 'in_progress' }, 'accept_order', { nextStatus: 'resolved' });
    });
    expect(result.current.localEvents).toHaveLength(2);
  });
});
