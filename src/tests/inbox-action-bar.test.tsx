import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mutateAsyncMock = vi.fn().mockResolvedValue({});
vi.mock('@/hooks/useInboxEntries', () => ({
  useApplyGenericEntryAction: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}));

import { InboxActionBar } from '@/components/seller/inbox/InboxActionBar';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

const baseEntry: InboxEntry = {
  id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
  buyer_phone: null, location_id: null, entry_type: 'new_order_confirmation', status: 'new',
  source_channel: 'storefront', source_entity_type: 'order', source_entity_id: 'o1',
  title: 'Sri Krishna Enterprises', summary: 'New order', amount: 58000, currency: 'INR',
  priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
  last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
  metadata: {}, allowed_actions: ['accept_order', 'contact_buyer', 'reject'], time_bucket: 'today', customer_entry_count: 1,
};

function renderBar(entry: InboxEntry, applyLocalAction = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <InboxActionBar entry={entry} tenantId="t1" applyLocalAction={applyLocalAction} />
    </QueryClientProvider>,
  );
  return { applyLocalAction };
}

describe('InboxActionBar', () => {
  beforeEach(() => {
    mutateAsyncMock.mockClear();
    window.localStorage?.clear?.();
  });

  it('renders only entry-specific text CTAs and keeps reject as an icon action', () => {
    renderBar(baseEntry);
    expect(screen.getByRole('button', { name: 'Accept order' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contact buyer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('puts the primary CTA rightmost, after secondary actions', () => {
    renderBar(baseEntry);
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['Reject', 'Accept order']);
  });

  it('applies a non-destructive local action immediately without a confirm dialog', () => {
    const { applyLocalAction } = renderBar(baseEntry);
    fireEvent.click(screen.getByRole('button', { name: 'Accept order' }));
    expect(applyLocalAction).toHaveBeenCalledWith(baseEntry, 'accept_order', expect.any(Object));
  });

  it('shows a confirm dialog before a destructive action, and applies only after confirming', () => {
    const { applyLocalAction } = renderBar(baseEntry);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(applyLocalAction).not.toHaveBeenCalled();
    expect(screen.getByText(/reject this order/i)).toBeInTheDocument();
    // The trigger button behind the dialog is marked aria-hidden by Radix while the
    // dialog is open, so only the dialog's own confirm button is queryable by role.
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(applyLocalAction).toHaveBeenCalledWith(baseEntry, 'reject', expect.any(Object));
  });

  it('calls the real mutation for a generic action', async () => {
    renderBar({ ...baseEntry, entry_type: 'invoice_due', allowed_actions: ['send_reminder', 'remind_later'] });
    fireEvent.click(screen.getByRole('button', { name: 'Remind later' }));
    expect(screen.getByText('Remind later')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
  });

  it('opens Add note inline and persists the note through the entry action API', async () => {
    renderBar({ ...baseEntry, allowed_actions: ['accept_order', 'add_note'] });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    fireEvent.change(screen.getByPlaceholderText('Type a short note for this item'), {
      target: { value: 'Buyer asked for dispatch after 4 pm.' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add note' }).at(-1)!);
    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        entryId: 'e1',
        action: 'add_note',
        note: 'Buyer asked for dispatch after 4 pm.',
      });
    });
  });

  it('shows previous notes inline when note events exist', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <InboxActionBar
          entry={{ ...baseEntry, allowed_actions: ['add_note'] }}
          tenantId="t1"
          applyLocalAction={vi.fn()}
          historyEvents={[
            {
              id: 'note-1',
              entry_id: 'e1',
              action: 'add_note',
              note: 'Already promised to call tomorrow.',
              actor_id: 'u1',
              created_at: '2026-09-18T08:00:00Z',
            },
          ]}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Already promised to call tomorrow.')).toBeInTheDocument();
  });
});
