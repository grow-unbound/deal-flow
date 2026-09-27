import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useInboxEntries', () => ({
  useEnquiryTriage: () => ({ data: { lines: [{ id: 'l1' }, { id: 'l2' }] }, isLoading: false, isError: false }),
  useApplyGenericEntryAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { InboxEntryCard } from '@/components/seller/inbox/InboxEntryCard';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

const ENQUIRY_ENTRY: InboxEntry = {
  id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
  buyer_phone: null, location_id: null, entry_type: 'new_enquiry', status: 'new',
  source_channel: 'storefront', source_entity_type: 'estimate', source_entity_id: 'est-1',
  title: 'Sri Krishna Enterprises', summary: 'Open enquiry', amount: 17704, currency: 'INR',
  priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
  last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
  metadata: { estimate_number: 'EST-016127' }, allowed_actions: ['convert', 'reply_quote'],
  time_bucket: 'today', customer_entry_count: 1,
};

function renderCard(entry: InboxEntry, expanded = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InboxEntryCard
        entry={entry}
        expanded={expanded}
        onToggle={vi.fn()}
        tenantId="t1"
        applyLocalAction={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('InboxEntryCard — enquiry header', () => {
  it('shows the estimate number in the title and the item count, even when collapsed', () => {
    renderCard(ENQUIRY_ENTRY);
    expect(screen.getByText('Open enquiry · EST-016127')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('links the estimate open-in-new-tab icon to the source estimate', () => {
    renderCard(ENQUIRY_ENTRY);
    const link = screen.getByRole('link', { name: 'Open estimate in new tab' });
    expect(link).toHaveAttribute('href', '/estimates/est-1');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
