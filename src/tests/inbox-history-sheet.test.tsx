import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useEntryHistoryMock = vi.fn();
vi.mock('@/hooks/useInboxEntries', () => ({
  useEntryHistory: (...args: unknown[]) => useEntryHistoryMock(...args),
}));

import { InboxHistorySheet } from '@/components/seller/inbox/InboxHistorySheet';

function renderSheet(props: Partial<React.ComponentProps<typeof InboxHistorySheet>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InboxHistorySheet
        open
        onOpenChange={() => {}}
        buyerId="b1"
        buyerName="Ramesh Traders"
        localEvents={[]}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('InboxHistorySheet', () => {
  beforeEach(() => useEntryHistoryMock.mockReset());

  it('renders real events merged newest-first with local ones', () => {
    useEntryHistoryMock.mockReturnValue({
      data: { events: [{ id: 'ev1', entry_id: 'e1', entry_type: 'invoice_overdue', action: 'send_reminder', from_status: 'new', to_status: 'opened', note: null, actor_id: 'u1', created_at: '2026-09-01T00:00:00Z' }] },
      isLoading: false,
    });
    renderSheet({
      localEvents: [{ id: 'local-1', entry_id: 'e2', entry_type: 'new_order_confirmation', action: 'accept_order', from_status: 'new', to_status: 'resolved', note: null, created_at: '2026-09-07T00:00:00Z', synced: false }],
    });
    expect(screen.getByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.getByText(/send reminder/i)).toBeInTheDocument();
    expect(screen.getByText(/accept order/i)).toBeInTheDocument();
    expect(screen.getByText(/not yet synced/i)).toBeInTheDocument();
  });

  it('shows an empty message when there is no history', () => {
    useEntryHistoryMock.mockReturnValue({ data: { events: [] }, isLoading: false });
    renderSheet();
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
});
