import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useInboxEntriesMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@/hooks/useInboxEntries', () => ({
  useInboxEntries: (...args: unknown[]) => useInboxEntriesMock(...args),
  useApplyGenericEntryAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEntryHistory: () => ({ data: { events: [] }, isLoading: false }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ id: 'b1' }),
}));

import { InboxDetailClient } from '@/components/seller/inbox/InboxDetailClient';
import { SplitPaneCloseContext } from '@/components/seller/layout/EntitySplitShell';

const ENTRIES = [
  {
    id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
    buyer_phone: '9990001111', location_id: null, entry_type: 'new_order_confirmation', status: 'new',
    source_channel: 'storefront', source_entity_type: 'order', source_entity_id: 'o1',
    title: 'Sri Krishna Enterprises', summary: '₹58,000 · 14 items', amount: 58000, currency: 'INR',
    priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: ['accept_order', 'reject'], time_bucket: 'today', customer_entry_count: 2,
  },
  {
    id: 'e2', entry_number: 2, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
    buyer_phone: '9990001111', location_id: null, entry_type: 'invoice_due', status: 'new',
    source_channel: 'backend', source_entity_type: 'invoice', source_entity_id: 'inv1',
    title: 'Sri Krishna Enterprises', summary: '₹18,400 due in 4 days', amount: 18400, currency: 'INR',
    priority_at: '2026-09-05T10:00:00Z', remind_at: null, created_at: '2026-09-05T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: ['send_reminder'], time_bucket: 'this_week', customer_entry_count: 2,
  },
];

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InboxDetailClient buyerId="b1" />
    </QueryClientProvider>,
  );
}

describe('InboxDetailClient', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    useInboxEntriesMock.mockReset();
    useInboxEntriesMock.mockReturnValue({ data: { entries: ENTRIES, nextCursor: null }, isLoading: false });
  });

  it('renders a card stack for a customer with multiple open items, all collapsed by default', () => {
    renderDetail();
    expect(screen.getByText('Sri Krishna Enterprises')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept order' })).not.toBeInTheDocument();
  });

  it('expands one card at a time', () => {
    renderDetail();
    fireEvent.click(screen.getByText(/58,000/));
    expect(screen.getByRole('button', { name: 'Accept order' })).toBeInTheDocument();
    fireEvent.click(screen.getByText(/18,400/));
    expect(screen.queryByRole('button', { name: 'Accept order' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
  });

  it('renders a close-pane button that calls the context close function when clicked', () => {
    const closeMock = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SplitPaneCloseContext.Provider value={closeMock}>
          <InboxDetailClient buyerId="b1" />
        </SplitPaneCloseContext.Provider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close detail pane' }));
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
