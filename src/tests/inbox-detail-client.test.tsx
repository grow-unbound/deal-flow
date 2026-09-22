import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useInboxEntriesMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@/hooks/useInboxEntries', () => ({
  useInboxEntries: (...args: unknown[]) => useInboxEntriesMock(...args),
  useApplyGenericEntryAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendCollectionReminder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEntryHistory: () => ({ data: { events: [] }, isLoading: false }),
  useEnquiryTriage: () => ({ data: undefined, isLoading: false, isError: false }),
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
    metadata: { invoice_number: 'INV-1042', due_date: '2026-09-18T00:00:00Z', days_from_due: 4, aging_tier: 'due_soon' }, allowed_actions: ['send_reminder'], time_bucket: 'this_week', customer_entry_count: 2,
  },
];

const CREDIT_LIMIT_ENTRY = {
  id: 'credit-1', entry_number: 3, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
  buyer_phone: '9990001111', location_id: null, entry_type: 'credit_limit_breach', status: 'new',
  source_channel: 'backend', source_entity_type: 'buyer', source_entity_id: 'b1',
  title: 'Sri Krishna Enterprises', summary: 'Over credit limit', amount: 25000, currency: 'INR',
  priority_at: '2026-09-08T10:00:00Z', remind_at: null, created_at: '2026-09-08T10:00:00Z',
  last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
  metadata: {
    over_limit_amount: 25000,
    credit_limit: 100000,
    payment_terms_days: 30,
    outstanding_balance: 125000,
  },
  allowed_actions: ['adjust_limit'],
  time_bucket: 'today',
  customer_entry_count: 1,
};

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
    fireEvent.click(screen.getByRole('button', { name: /Dues/ }));
    expect(screen.queryByRole('button', { name: 'Accept order' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
    expect(screen.getByText('INV-1042')).toBeInTheDocument();
    expect(screen.getByText('Due in 4 days')).toBeInTheDocument();
  });

  it('never renders a close-pane button — Today has no closed state, even when the shell provides a close callback', () => {
    const closeMock = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SplitPaneCloseContext.Provider value={closeMock}>
          <InboxDetailClient buyerId="b1" />
        </SplitPaneCloseContext.Provider>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Close detail pane' })).not.toBeInTheDocument();
  });

  it('shows the customer name and open-issue count in the header', () => {
    renderDetail();
    expect(screen.getByText('Sri Krishna Enterprises')).toBeInTheDocument();
    expect(screen.getByText('2 open issues')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View Sri Krishna Enterprises/i })).not.toBeInTheDocument();
  });

  it('shows credit-limit context and keeps the primary reminder CTA rightmost, after adjust-limit, on over-limit cards', () => {
    useInboxEntriesMock.mockReturnValue({ data: { entries: [CREDIT_LIMIT_ENTRY], nextCursor: null }, isLoading: false });
    renderDetail();

    expect(screen.getByText('₹25,000 over limit')).toBeInTheDocument();
    expect(screen.getByText('₹1,00,000')).toBeInTheDocument();
    expect(screen.getByText('Net 30 days')).toBeInTheDocument();
    expect(screen.getByText('₹1,25,000')).toBeInTheDocument();

    const actions = screen.getAllByRole('button').map((button) => button.textContent?.trim()).filter(Boolean);
    expect(actions.indexOf('Adjust limit')).toBeLessThan(actions.indexOf('Send reminder'));
  });
});
