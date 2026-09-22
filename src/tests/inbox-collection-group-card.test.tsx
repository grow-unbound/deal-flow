import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useInboxEntries', () => ({
  useApplyGenericEntryAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendCollectionReminder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { InboxCollectionGroupCard } from '@/components/seller/inbox/InboxCollectionGroupCard';
import { buildCollectionGroup } from '@/lib/inbox/inbox-detail-groups';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

function dueEntry(id: string, type: 'invoice_due' | 'invoice_overdue', amount: number): InboxEntry {
  return {
    id, entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Digital Eye',
    buyer_phone: null, location_id: null, entry_type: type, status: 'new',
    source_channel: 'backend', source_entity_type: 'invoice', source_entity_id: id,
    title: 'Digital Eye', summary: '', amount, currency: 'INR',
    priority_at: '2026-09-08T00:00:00Z', remind_at: null, created_at: '2026-09-08T00:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: ['send_reminder'], time_bucket: 'today', customer_entry_count: 1,
  };
}

function renderCard(entries: InboxEntry[]) {
  const group = buildCollectionGroup(entries)!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InboxCollectionGroupCard group={group} buyerId="b1" expanded={false} onToggle={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('InboxCollectionGroupCard — title/subtitle', () => {
  it('uses a static title and puts the amount + counts in the subtitle when mixed', () => {
    renderCard([dueEntry('a', 'invoice_due', 90690), dueEntry('b', 'invoice_overdue', 25490)]);
    expect(screen.getByText('Upcoming dues or overdue')).toBeInTheDocument();
    expect(screen.getByText('2 invoices · ₹1,16,180 due · 1 overdue')).toBeInTheDocument();
  });

  it('says "overdue" only when every invoice in the group is overdue', () => {
    renderCard([dueEntry('a', 'invoice_overdue', 22000)]);
    expect(screen.getByText('Upcoming dues or overdue')).toBeInTheDocument();
    expect(screen.getByText('1 invoice · ₹22,000 overdue')).toBeInTheDocument();
  });
});
