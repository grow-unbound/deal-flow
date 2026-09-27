import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useInboxEntriesMock = vi.fn();

vi.mock('@/hooks/useInboxEntries', () => ({
  useInboxEntries: (...args: unknown[]) => useInboxEntriesMock(...args),
  useApplyGenericEntryAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendCollectionReminder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEntryHistory: () => ({ data: { events: [] }, isLoading: false }),
  useEnquiryTriage: () => ({ data: undefined, isLoading: false, isError: false }),
}));
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ buyerId: 'b1' }),
}));

import { InboxDetailClient } from '@/components/seller/inbox/InboxDetailClient';

const ENTRIES = [
  {
    id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
    buyer_phone: null, location_id: null, entry_type: 'new_order_confirmation', status: 'new',
    source_channel: 'storefront', source_entity_type: 'order', source_entity_id: 'o1',
    title: 'Sri Krishna Enterprises', summary: '₹58,000 · 14 items', amount: 58000, currency: 'INR',
    priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: ['accept_order', 'reject'], time_bucket: 'today', customer_entry_count: 2,
  },
  {
    id: 'e2', entry_number: 2, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
    buyer_phone: null, location_id: null, entry_type: 'invoice_due', status: 'new',
    source_channel: 'backend', source_entity_type: 'invoice', source_entity_id: 'inv1',
    title: 'Sri Krishna Enterprises', summary: '₹18,400 due in 4 days', amount: 18400, currency: 'INR',
    priority_at: '2026-09-05T10:00:00Z', remind_at: null, created_at: '2026-09-05T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: { invoice_number: 'INV-1042', due_date: '2026-09-18T00:00:00Z', days_from_due: 4, aging_tier: 'due_soon' }, allowed_actions: ['send_reminder'], time_bucket: 'this_week', customer_entry_count: 2,
  },
];

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: width >= 768,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InboxDetailClient buyerId="b1" />
    </QueryClientProvider>,
  );
}

describe('InboxDetailClient on mobile', () => {
  beforeEach(() => {
    useInboxEntriesMock.mockReset();
    pushMock.mockReset();
    useInboxEntriesMock.mockReturnValue({ data: { entries: ENTRIES, nextCursor: null }, isLoading: false });
    setViewportWidth(375);
  });

  it('renders a non-collection entry as a tappable row that pushes to its own stacked screen', () => {
    renderDetail();
    const row = screen.getByRole('button', { name: /New order/ });
    expect(row).toBeInTheDocument();
    fireEvent.click(row);
    expect(pushMock).toHaveBeenCalledWith('/today/b1/e1');
    // Row navigates away instead of expanding inline -- no per-item action CTA here.
    expect(screen.queryByRole('button', { name: 'Accept order' })).not.toBeInTheDocument();
  });

  it('renders the grouped Dues as a card like the other rows, navigating to its own screen', () => {
    renderDetail();
    const duesCard = screen.getByRole('button', { name: /Upcoming dues or overdue/ });
    // Card, not an accordion: nothing expands inline, no invoice list or actions in the flow.
    expect(duesCard).not.toHaveAttribute('aria-expanded');
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
    expect(screen.queryByText('INV-1042')).not.toBeInTheDocument();

    fireEvent.click(duesCard);
    expect(pushMock).toHaveBeenCalledWith('/today/b1/dues');
  });
});
